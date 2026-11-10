import { createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { MongoClient } from 'mongodb';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically load environment files if MONGODB_URI is not already defined in process.env
if (!process.env.MONGODB_URI) {
  const candidateEnvPaths = [
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'server/.env'),
    path.resolve(process.cwd(), '../.env'),
  ];
  for (const envPath of candidateEnvPaths) {
    if (fs.existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
        if (process.env.MONGODB_URI) break;
      } catch {
        // continue to next candidate
      }
    }
  }
}

const scrypt = promisify(scryptCallback);
const app = express();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const sessionDurationMs = 14 * 24 * 60 * 60 * 1000;
const otpDurationMs = 5 * 60 * 1000;
const cookieName = 'aerotrack_session';
const sessionSecret = process.env.SESSION_SECRET;
const emailProvider = process.env.EMAIL_PROVIDER ?? 'dev';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
if (!['dev', 'smtp'].includes(emailProvider)) throw new Error('EMAIL_PROVIDER must be dev or smtp.');
if (process.env.NODE_ENV === 'production' && emailProvider !== 'smtp') {
  throw new Error('Production requires EMAIL_PROVIDER=smtp.');
}
if (emailProvider === 'smtp' && (!process.env.MAIL_HOST || !process.env.MAIL_FROM)) {
  throw new Error('MAIL_HOST and MAIL_FROM are required when EMAIL_PROVIDER=smtp.');
}

// Enable CORS & Preflight handling
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Authorization');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '16kb' }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 150,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
);
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));

let users;
let sessions;
let challenges;
let outbox;
let transporter;
let isDbConnected = false;
let dbMode = 'pending';
let dbNotice = null;

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const normalizedEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
const emailIsValid = (email) => /^\S+@\S+\.\S+$/.test(email);
const passwordIsValid = (password) =>
  typeof password === 'string' && password.length >= 10 && password.length <= 128 && /[a-z]/i.test(password) && /\d/.test(password);

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    preferences: user.preferences,
    tutorialCompleted: user.tutorialCompleted,
  };
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split(/=(.*)/s, 2))
      .filter(([name, value]) => name && value !== undefined)
      .map(([name, value]) => [name, value]),
  );
}

const tokenDigest = (token) => createHmac('sha256', sessionSecret).update(token).digest('hex');
const otpDigest = (email, purpose, code) =>
  createHmac('sha256', sessionSecret).update(`${email}:${purpose}:${code}`).digest('hex');

async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

async function passwordMatches(password, storedHash) {
  if (typeof password !== 'string' || password.length > 128 || typeof storedHash !== 'string') return false;
  const [salt, hash] = (storedHash ?? '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDurationMs / 1000}${secure ? '; Secure' : ''}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function requireAjax(req, _res, next) {
  if (req.get('X-Requested-With') !== 'aerotrack') return next(fail(403, 'REQUEST_REJECTED', 'This request could not be verified.'));
  next();
}

async function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[cookieName];
  if (!token) return null;
  const session = await sessions.findOne({ _id: tokenDigest(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await users.findOne({ _id: session.userId });
  return user?.emailVerified ? user : null;
}

async function createSession(user, res) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await sessions.insertOne({ _id: tokenDigest(token), userId: user._id, createdAt: new Date(), expiresAt });
  setSessionCookie(res, token);
}

async function sendChallenge(email, purpose) {
  const now = new Date();
  const previous = await challenges.findOne({ email, purpose, createdAt: { $gt: new Date(now.getTime() - 60_000) } });
  if (previous) throw fail(429, 'OTP_COOLDOWN', 'Please wait before requesting another code.');

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(now.getTime() + otpDurationMs);
  await challenges.deleteMany({ email, purpose });
  await challenges.insertOne({ email, purpose, codeHash: otpDigest(email, purpose, code), attempts: 0, createdAt: now, expiresAt });

  const subject = purpose === 'verify-email' ? 'Verify your AeroTrack account' : 'Reset your AeroTrack password';
  const text = `${subject}\n\nYour verification code is ${code}. It expires in 5 minutes.\n\nIf you did not request this, you can ignore this email.`;
  if (emailProvider === 'dev') {
    await outbox.insertOne({ to: email, subject, text, createdAt: now });
    return { devOtp: code };
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM, to: email, subject, text });
  return {};
}

async function sendAuthChallenge(email, purpose) {
  const result = await sendChallenge(email, purpose);
  return { ...result, emailMode: emailProvider };
}

function validateNewPassword(password) {
  if (!passwordIsValid(password)) {
    throw fail(400, 'INVALID_PASSWORD', 'Use at least 10 characters with letters and a number.');
  }
}

// Public health check and status endpoint
app.get(['/', '/api/health'], (_req, res) => {
  res.json({
    status: 'ok',
    database: isDbConnected ? 'connected' : (dbMode === 'memory' ? 'in-memory-dev-store' : 'connecting'),
    databaseProvider: 'MongoDB Atlas',
    databaseName: process.env.MONGODB_DB || 'aerotrack',
    dbMode,
    emailMode: emailProvider,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    ...(dbNotice ? { dbNotice } : {}),
  });
});

app.use('/api', requireAjax);

app.get('/api/auth/me', async (req, res) => {
  const user = await currentUser(req);
  res.json({ user: user ? publicUser(user) : null, emailMode: emailProvider });
});

app.post('/api/auth/register', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = normalizedEmail(req.body?.email);
  const password = req.body?.password;
  if (name.length < 2 || name.length > 100) throw fail(400, 'INVALID_NAME', 'Enter a name between 2 and 100 characters.');
  if (!emailIsValid(email) || email.length > 254) throw fail(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  validateNewPassword(password);
  if (await users.findOne({ email })) throw fail(409, 'EMAIL_IN_USE', 'An account already exists for this email.');

  const user = {
    name,
    email,
    passwordHash: await passwordHash(password),
    role: 'passenger',
    emailVerified: false,
    createdAt: new Date(),
    preferences: { emailNotifications: false, browserNotifications: false },
    tutorialCompleted: false,
  };
  await users.insertOne(user);
  res.status(201).json(await sendAuthChallenge(email, 'verify-email'));
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const user = await users.findOne({ email });
  if (!user || !(await passwordMatches(req.body?.password, user.passwordHash))) {
    throw fail(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  if (!user.emailVerified) throw fail(403, 'EMAIL_NOT_VERIFIED', 'Verify your email address before signing in.');
  await createSession(user, res);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const challenge = await challenges.findOne({ email, purpose: 'verify-email', expiresAt: { $gt: new Date() } });
  if (!challenge || challenge.attempts >= 5) throw fail(400, 'INVALID_OTP', 'This code is invalid or expired.');
  const supplied = Buffer.from(otpDigest(email, 'verify-email', code), 'hex');
  const expected = Buffer.from(challenge.codeHash, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    await challenges.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    throw fail(400, 'INVALID_OTP', 'This code is invalid or expired.');
  }
  const user = await users.findOneAndUpdate(
    { email, emailVerified: false },
    { $set: { emailVerified: true } },
    { returnDocument: 'after' },
  );
  if (!user) throw fail(400, 'INVALID_OTP', 'This code is invalid or expired.');
  await challenges.deleteMany({ email, purpose: 'verify-email' });
  await createSession(user, res);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/resend-otp', async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const purpose = req.body?.purpose === 'reset-password' ? 'reset-password' : 'verify-email';
  const user = await users.findOne({ email });
  const shouldSend = user && (purpose === 'reset-password' || !user.emailVerified);
  let result = {};
  if (shouldSend) {
    try {
      result = await sendChallenge(email, purpose);
    } catch (error) {
      if (error.code !== 'OTP_COOLDOWN') throw error;
    }
  }
  res.json({
    ...result,
    message: 'If this address is eligible, a new code has been sent.',
    cooldownSeconds: 60,
  });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const user = await users.findOne({ email, emailVerified: true });
  let result = { emailMode: emailProvider };
  if (user) {
    try {
      result = await sendAuthChallenge(email, 'reset-password');
    } catch (error) {
      if (error.code !== 'OTP_COOLDOWN') throw error;
    }
  }
  res.json(result);
});

app.post('/api/auth/reset-password', async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  validateNewPassword(req.body?.password);
  const challenge = await challenges.findOne({ email, purpose: 'reset-password', expiresAt: { $gt: new Date() } });
  if (!challenge || challenge.attempts >= 5) throw fail(400, 'INVALID_OTP', 'This code is invalid or expired.');
  const supplied = Buffer.from(otpDigest(email, 'reset-password', code), 'hex');
  const expected = Buffer.from(challenge.codeHash, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    await challenges.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    throw fail(400, 'INVALID_OTP', 'This code is invalid or expired.');
  }
  const user = await users.findOneAndUpdate(
    { email, emailVerified: true },
    { $set: { passwordHash: await passwordHash(req.body.password) } },
  );
  if (!user) throw fail(400, 'INVALID_OTP', 'This code is invalid or expired.');
  await Promise.all([challenges.deleteMany({ email }), sessions.deleteMany({ userId: user._id })]);
  res.status(204).end();
});

app.post('/api/auth/logout', async (req, res) => {
  const token = parseCookies(req.headers.cookie)[cookieName];
  if (token) await sessions.deleteOne({ _id: tokenDigest(token) });
  clearSessionCookie(res);
  res.status(204).end();
});

app.post('/api/auth/logout-all', async (req, res) => {
  const user = await currentUser(req);
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  await sessions.deleteMany({ userId: user._id });
  clearSessionCookie(res);
  res.status(204).end();
});

app.get('/api/auth/dev-outbox', async (_req, res) => {
  if (emailProvider !== 'dev' || process.env.NODE_ENV === 'production') {
    throw fail(404, 'NOT_FOUND', 'Not found.');
  }
  const items = await outbox.find().sort({ createdAt: -1 }).limit(50).toArray();
  res.json({
    notice: 'These messages are stored only for local development and were not sent.',
    items: items.map(({ to, subject, text, createdAt }) => ({ to, subject, text, createdAt })),
  });
});

app.patch('/api/users/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const updates = {};
  if (req.body?.name !== undefined) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2 || name.length > 100) throw fail(400, 'INVALID_NAME', 'Enter a name between 2 and 100 characters.');
    updates.name = name;
  }
  if (req.body?.preferences !== undefined) {
    const preferences = req.body.preferences;
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      throw fail(400, 'INVALID_PREFERENCES', 'Invalid notification preferences.');
    }
    for (const key of ['emailNotifications', 'browserNotifications']) {
      if (preferences[key] !== undefined) {
        if (typeof preferences[key] !== 'boolean') throw fail(400, 'INVALID_PREFERENCES', 'Invalid notification preferences.');
        updates[`preferences.${key}`] = preferences[key];
      }
    }
  }
  if (!Object.keys(updates).length) throw fail(400, 'EMPTY_UPDATE', 'No supported profile changes were provided.');
  await users.updateOne({ _id: user._id }, { $set: updates });
  res.status(204).end();
});

app.post('/api/users/me/password', async (req, res) => {
  const user = await currentUser(req);
  if (!user) throw fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  if (!(await passwordMatches(req.body?.currentPassword, user.passwordHash))) {
    throw fail(400, 'INVALID_PASSWORD', 'Current password is incorrect.');
  }
  validateNewPassword(req.body?.newPassword);
  if (req.body.currentPassword === req.body.newPassword) {
    throw fail(400, 'PASSWORD_UNCHANGED', 'Choose a new password different from your current password.');
  }
  await users.updateOne({ _id: user._id }, { $set: { passwordHash: await passwordHash(req.body.newPassword) } });
  const token = parseCookies(req.headers.cookie)[cookieName];
  await sessions.deleteMany({ userId: user._id, _id: { $ne: tokenDigest(token) } });
  res.status(204).end();
});

app.use((_req, _res, next) => next(fail(404, 'NOT_FOUND', 'API route not found.')));
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
  }
  if (err.status) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  if (err.code === 11000) return res.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'An account already exists for this email.' } });
  console.error('AeroTrack API request failed:', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The server could not complete this request.' } });
});

function createMemoryStore() {
  const store = {
    users: [],
    sessions: [],
    challenges: [],
    outbox: [],
  };

  const matches = (doc, filter) => {
    if (!filter) return true;
    for (const [key, val] of Object.entries(filter)) {
      if (val && typeof val === 'object' && !(val instanceof Date) && !(val instanceof Buffer)) {
        if ('$gt' in val) {
          const d = doc[key] instanceof Date ? doc[key].getTime() : doc[key];
          const t = val.$gt instanceof Date ? val.$gt.getTime() : val.$gt;
          if (!(d > t)) return false;
        }
        if ('$ne' in val) {
          if (doc[key] === val.$ne) return false;
        }
      } else {
        if (doc[key] !== val) return false;
      }
    }
    return true;
  };

  const applySet = (doc, updates) => {
    for (const [k, v] of Object.entries(updates)) {
      if (k.includes('.')) {
        const parts = k.split('.');
        let curr = doc;
        for (let i = 0; i < parts.length - 1; i++) {
          curr[parts[i]] = curr[parts[i]] || {};
          curr = curr[parts[i]];
        }
        curr[parts[parts.length - 1]] = v;
      } else {
        doc[k] = v;
      }
    }
  };

  const createCollection = (name) => ({
    async createIndex() {},
    async findOne(filter) {
      const found = store[name].find((d) => matches(d, filter));
      return found ? JSON.parse(JSON.stringify(found)) : null;
    },
    async insertOne(doc) {
      const cloned = { ...doc, _id: doc._id ?? randomBytes(12).toString('hex') };
      store[name].push(cloned);
      return { insertedId: cloned._id };
    },
    async updateOne(filter, update) {
      const found = store[name].find((d) => matches(d, filter));
      if (!found) return { matchedCount: 0, modifiedCount: 0 };
      if (update.$set) applySet(found, update.$set);
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          found[k] = (found[k] || 0) + v;
        }
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async findOneAndUpdate(filter, update, _options = {}) {
      const found = store[name].find((d) => matches(d, filter));
      if (!found) return null;
      if (update.$set) applySet(found, update.$set);
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          found[k] = (found[k] || 0) + v;
        }
      }
      return JSON.parse(JSON.stringify(found));
    },
    async deleteOne(filter) {
      const idx = store[name].findIndex((d) => matches(d, filter));
      if (idx !== -1) {
        store[name].splice(idx, 1);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },
    async deleteMany(filter) {
      const prevLen = store[name].length;
      store[name] = store[name].filter((d) => !matches(d, filter));
      return { deletedCount: prevLen - store[name].length };
    },
    find(filter = {}) {
      let results = store[name].filter((d) => matches(d, filter));
      return {
        sort(sortObj = {}) {
          const [field, dir] = Object.entries(sortObj)[0] || ['createdAt', -1];
          results.sort((a, b) => {
            const va = a[field] instanceof Date ? a[field].getTime() : a[field];
            const vb = b[field] instanceof Date ? b[field].getTime() : b[field];
            return dir === -1 ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
          });
          return this;
        },
        limit(n) {
          results = results.slice(0, n);
          return this;
        },
        async toArray() {
          return JSON.parse(JSON.stringify(results));
        },
      };
    },
  });

  return {
    users: createCollection('users'),
    sessions: createCollection('sessions'),
    challenges: createCollection('challenges'),
    outbox: createCollection('outbox'),
  };
}

async function connectMongo() {
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || undefined);
  const mongoUsers = db.collection('users');
  const mongoSessions = db.collection('sessions');
  const mongoChallenges = db.collection('auth_challenges');
  const mongoOutbox = db.collection('email_outbox');
  await Promise.all([
    mongoUsers.createIndex({ email: 1 }, { unique: true }),
    mongoSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    mongoChallenges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    mongoChallenges.createIndex({ email: 1, purpose: 1 }, { unique: true }),
    mongoOutbox.createIndex({ createdAt: -1 }, { expireAfterSeconds: 604800 }),
  ]);
  users = mongoUsers;
  sessions = mongoSessions;
  challenges = mongoChallenges;
  outbox = mongoOutbox;
  isDbConnected = true;
  dbMode = 'mongodb';
  dbNotice = null;
}

async function start() {
  try {
    await connectMongo();
    console.log(`[AeroTrack API] MongoDB Atlas connected successfully to database "${process.env.MONGODB_DB || 'aerotrack'}"!`);
  } catch (err) {
    const isSslAlert80 = String(err?.message ?? '').includes('alert number 80') || err?.code === 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR';
    if (isSslAlert80) {
      dbNotice = 'MongoDB Atlas rejected connection: your current public IP is not in Atlas Network Access. In MongoDB Atlas, go to Network Access -> Add IP Address -> Add 0.0.0.0/0 (or your current IP).';
    } else {
      dbNotice = `MongoDB connection issue: ${err.message}`;
    }

    if (process.env.NODE_ENV === 'production') {
      throw err;
    }

    console.warn('\n================================================================');
    console.warn('⚠️  [AeroTrack API] MongoDB Atlas connection could not be established:');
    if (isSslAlert80) {
      console.warn('   Reason: TLS Alert 80 (IP Access Blocked).');
      console.warn('   Your public IP is not whitelisted in MongoDB Atlas Network Access.');
      console.warn('   👉 Fix: Log in to cloud.mongodb.com -> Network Access -> Add IP Address');
      console.warn('           Add "0.0.0.0/0" (Allow access from anywhere) or your current IP.');
    } else {
      console.warn(`   Reason: ${err.message}`);
    }
    console.warn('\n   ⚡ Running with local in-memory fallback store so frontend and auth');
    console.warn('      remain fully functional and runnable while you configure Atlas.');
    console.warn('      Will automatically reconnect to MongoDB Atlas once accessible.');
    console.warn('================================================================\n');

    const mem = createMemoryStore();
    users = mem.users;
    sessions = mem.sessions;
    challenges = mem.challenges;
    outbox = mem.outbox;
    dbMode = 'memory';

    const retryInterval = setInterval(async () => {
      try {
        await connectMongo();
        clearInterval(retryInterval);
        console.log('\n✅ [AeroTrack API] Reconnected to MongoDB Atlas! Live database is now active.\n');
      } catch {
        // Keep retrying in background
      }
    }, 20000);
    retryInterval.unref();
  }

  if (emailProvider === 'smtp') {
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: process.env.MAIL_SECURE === 'true',
      auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD } : undefined,
    });
    await transporter.verify();
  }

  app.listen(port, host, () => {
    console.log(`[AeroTrack API] Listening on http://${host}:${port}`);
    console.log(`[AeroTrack API] Health check: http://${host}:${port}/api/health`);
  });
}

start().catch((err) => {
  console.error('Could not start the AeroTrack API:', err);
  process.exitCode = 1;
});
