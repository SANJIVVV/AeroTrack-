/**
 * AUTHENTICATION CONTROLLER
 * -------------------------
 * Handles HTTP requests and responses for authentication workflows:
 * - User Registration (passenger accounts)
 * - 6-Digit OTP Verification
 * - Resending OTP Codes
 * - User Login with Constant-Time Timing Guards
 * - User Logout (terminates session)
 * - Password Reset Workflows (forgot-password, reset-password)
 */
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Session, User } from '../models/index.js';
import { issueOtp, verifyOtp } from '../services/otp.js';
import { SESSION_COOKIE, clearSessionCache, cookieOptions, invalidateSession, startSession } from '../middleware/auth.js';
import { parse } from '../validators/common.js';
import { AppError } from '../utils/errors.js';
import { toPublicUser } from '../services/serializers.js';
import { audit } from '../services/audit.js';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')).pipe(z.string().max(254));
const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password is too long')
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use letters and at least one number');

// Precomputed cost-12 bcrypt hash to avoid blocking the Node.js event loop on startup
const DUMMY_HASH = '$2a$12$e8n1X.qg.0r0.4f3q0e1f.0r0.4f3q0e1f.0r0.4f3q0e1f.0r0';

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export function createAuthController(ctx) {
  const devMode = ctx.email.mode === 'dev' && ctx.env.NODE_ENV !== 'production';

  const devExtra = (otp) => (devMode && otp ? { devOtp: otp, devNotice: 'DEVELOPMENT MODE: no email was sent. This code is shown only because SMTP is not configured.' } : {});

  async function sendCode(user, purpose) {
    const otp = await issueOtp(ctx, user._id, purpose);
    if (!otp) return null;
    const verify = purpose === 'verify-email';
    await ctx.email.send({
      to: user.email,
      subject: verify ? 'Your AeroTrack Pro verification code' : 'Your AeroTrack Pro password reset code',
      text: `Hello ${user.name},\n\nYour ${verify ? 'verification' : 'password reset'} code is ${otp}.\nIt expires in 5 minutes and can be used once.\n\nIf you did not request this, you can ignore this email.`,
    });
    return otp;
  }

  return {
    async register(req, res) {
      const body = parse(z.object({ name: z.string().trim().min(2).max(100), email: emailSchema, password: passwordSchema }), req.body);
      const existing = await User.findOne({ email: body.email });
      let otp = null;
      if (!existing) {
        const user = await User.create({ name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12) });
        otp = await sendCode(user, 'verify-email');
        await audit(user, 'auth.register', { type: 'user', id: String(user._id) });
      } else if (!existing.emailVerified && !existing.isDemo) {
        otp = await sendCode(existing, 'verify-email');
      } else {
        throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with this email address already exists. Please sign in instead.');
      }
      res.status(202).json({
        message: 'If this email can be registered, a 6-digit code has been sent to it. Enter it to activate your account.',
        emailMode: ctx.email.mode,
        ...devExtra(otp),
      });
    },

    async verifyOtpHandler(req, res) {
      const body = parse(z.object({ email: emailSchema, code: codeSchema }), req.body);
      const user = await User.findOne({ email: body.email, isDemo: false });
      await verifyOtp(ctx, user?._id, 'verify-email', body.code);
      user.emailVerified = true;
      user.lastLoginAt = ctx.now();
      await user.save();
      await audit(user, 'auth.email_verified', { type: 'user', id: String(user._id) });
      await startSession(ctx.env, req, res, user);
      res.json({ message: 'Email verified. Welcome aboard.', user: toPublicUser(user) });
    },

    async resendOtp(req, res) {
      const body = parse(z.object({ email: emailSchema, purpose: z.enum(['verify-email', 'reset-password']).default('verify-email') }), req.body);
      const user = await User.findOne({ email: body.email, isDemo: false });
      if (body.purpose === 'verify-email' && user?.emailVerified) {
        return res.json({
          message: 'This email is already verified. You can sign in directly.',
          alreadyVerified: true,
          emailMode: ctx.email.mode,
        });
      }
      let otp = null;
      if (user && !user.disabled && (body.purpose === 'reset-password' || !user.emailVerified)) otp = await sendCode(user, body.purpose);
      res.status(202).json({
        message: 'If a code can be sent to this email, a new one is on its way. You can request another in 60 seconds.',
        cooldownSeconds: 60,
        emailMode: ctx.email.mode,
        ...devExtra(otp),
      });
    },

    async login(req, res) {
      const body = parse(z.object({ email: emailSchema, password: z.string().min(1).max(200) }), req.body);
      const user = await User.findOne({ email: body.email, isDemo: false }).select('+passwordHash');
      const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !ok || user.disabled) {
        await audit(user, 'auth.login_failed', user ? { type: 'user', id: String(user._id) } : undefined);
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      if (!user.emailVerified) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email with the 6-digit code before signing in.');
      user.lastLoginAt = ctx.now();
      await user.save();
      await startSession(ctx.env, req, res, user);
      await audit(user, 'auth.login_success', { type: 'user', id: String(user._id) });
      res.json({ message: 'Signed in.', user: toPublicUser(user) });
    },

    async forgotPassword(req, res) {
      const body = parse(z.object({ email: emailSchema }), req.body);
      const user = await User.findOne({ email: body.email, isDemo: false });
      let otp = null;
      if (user && !user.disabled && user.emailVerified) {
        otp = await sendCode(user, 'reset-password');
        if (otp) await audit(user, 'auth.reset_requested', { type: 'user', id: String(user._id) });
      }
      res.status(202).json({ message: 'If an account exists for this email, a 6-digit reset code has been sent.', emailMode: ctx.email.mode, ...devExtra(otp) });
    },

    async resetPassword(req, res) {
      const body = parse(z.object({ email: emailSchema, code: codeSchema, newPassword: passwordSchema }), req.body);
      const user = await User.findOne({ email: body.email, isDemo: false });
      await verifyOtp(ctx, user?._id, 'reset-password', body.code);
      user.passwordHash = await bcrypt.hash(body.newPassword, 12);
      await user.save();
      await audit(null, 'auth.password_reset', { type: 'user', id: String(user._id) });
      res.json({ message: 'Password reset successfully. You can now sign in with your new password.' });
    },

    async me(req, res) {
      res.json({
        user: req.user ? toPublicUser(req.user) : null,
        emailMode: ctx.email.mode,
      });
    },

    async logout(req, res) {
      if (req.sessionId) {
        await Session.findByIdAndDelete(req.sessionId).catch(() => {});
      }
      if (req.sessionTokenHash) {
        invalidateSession(req.sessionTokenHash);
      }
      res.clearCookie(SESSION_COOKIE, cookieOptions(ctx.env));
      res.json({ message: 'Signed out.' });
    },

    async logoutAll(req, res) {
      if (req.user?._id) {
        await Session.deleteMany({ user: req.user._id });
        clearSessionCache();
      }
      res.clearCookie(SESSION_COOKIE, cookieOptions(ctx.env));
      res.json({ message: 'Signed out of all devices.' });
    },

    async devOutbox(_req, res) {
      if (ctx.email.mode !== 'dev' || ctx.env.NODE_ENV === 'production') {
        throw new AppError(404, 'NOT_FOUND', 'Dev outbox is not available.');
      }
      res.json({
        notice: 'Development mode: SMTP is not configured. Messages are stored in server memory only.',
        items: ctx.email.outbox ?? [],
      });
    },
  };
}
