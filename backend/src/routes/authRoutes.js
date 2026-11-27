/**
 * AUTHENTICATION ROUTES
 * ---------------------
 * Express router mapping authentication endpoints to authController actions.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createAuthController } from '../controllers/authController.js';

export function authRoutes(ctx, limiters) {
  const r = Router();
  const ctrl = createAuthController(ctx);

  // Registration & OTP activation
  r.post('/register', limiters.auth, ctrl.register);
  r.post('/verify-otp', limiters.auth, ctrl.verifyOtpHandler);
  r.post('/resend-otp', limiters.email, ctrl.resendOtp);

  // Authentication session login, logout & status
  r.get('/me', ctrl.me);
  r.get('/dev-outbox', ctrl.devOutbox);
  r.post('/login', limiters.auth, ctrl.login);
  r.post('/logout', requireAuth, ctrl.logout);
  r.post('/logout-all', requireAuth, ctrl.logoutAll);

  // Password reset challenge & confirmation
  r.post('/forgot-password', limiters.auth, ctrl.forgotPassword);
  r.post('/reset-password', limiters.auth, ctrl.resetPassword);

  return r;
}
