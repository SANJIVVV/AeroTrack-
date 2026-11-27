import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { bootstrap } from '../bootstrap.js';
import { Session, User } from '../models/index.js';
import { ROLES } from '@aerotrack/shared';

/**
 * Creates or resets an account with a given role and password.
 * Usage: npm run create-user -- <email> <name> <password> <admin|staff|passenger>
 */
const [email, name, password, role] = process.argv.slice(2);
if (!email || !name || !password || !ROLES.includes(role)) {
  console.error(`Usage: npm run create-user -- <email> <name> <password> <${ROLES.join('|')}>`);
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters long.');
  process.exit(1);
}

await bootstrap();
const normalizedEmail = email.toLowerCase().trim();
const passwordHash = await bcrypt.hash(password, 12);

let user = await User.findOne({ email: normalizedEmail, isDemo: false });
if (user) {
  user.name = name;
  user.passwordHash = passwordHash;
  user.role = role;
  user.emailVerified = true;
  await user.save();
  await Session.deleteMany({ user: user._id });
  console.log(`Updated existing account ${normalizedEmail} with role '${role}'. Ready to sign in!`);
} else {
  user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash,
    role,
    emailVerified: true,
  });
  console.log(`Created new account ${normalizedEmail} with role '${role}'. Ready to sign in!`);
}

await mongoose.disconnect();
