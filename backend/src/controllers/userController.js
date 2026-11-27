/**
 * USER CONTROLLER
 * ---------------
 * Handles user profile and preference management:
 * - Update profile and preferences
 * - Change user password
 */
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Session, User } from '../models/index.js';
import { parse } from '../validators/common.js';
import { toPublicUser } from '../services/serializers.js';
import { AppError } from '../utils/errors.js';
import { audit } from '../services/audit.js';

export function createUserController(_ctx) {
  return {
    async updateMe(req, res) {
      const body = parse(
        z.object({
          name: z.string().trim().min(2).max(100).optional(),
          preferences: z.object({ emailNotifications: z.boolean().optional(), browserNotifications: z.boolean().optional() }).optional(),
          tutorialCompleted: z.boolean().optional(),
        }),
        req.body,
      );
      const u = req.user;
      if (body.name) u.name = body.name;
      if (body.preferences) {
        u.preferences = {
          emailNotifications: body.preferences.emailNotifications ?? u.preferences?.emailNotifications ?? true,
          browserNotifications: body.preferences.browserNotifications ?? u.preferences?.browserNotifications ?? false,
        };
      }
      if (body.tutorialCompleted !== undefined) u.tutorialCompleted = body.tutorialCompleted;
      await u.save();
      res.json({ user: toPublicUser(u) });
    },

    async changePassword(req, res) {
      const body = parse(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z
            .string()
            .min(10, 'Use at least 10 characters')
            .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use letters and at least one number'),
        }),
        req.body,
      );
      const user = await User.findById(req.user._id).select('+passwordHash');
      const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!ok) throw new AppError(400, 'INVALID_PASSWORD', 'Current password is not correct.');
      user.passwordHash = await bcrypt.hash(body.newPassword, 12);
      await user.save();
      await Session.deleteMany({ user: user._id, _id: { $ne: req.session?._id } });
      await audit(req.user, 'user.password_changed', { type: 'user', id: String(user._id) });
      res.json({ message: 'Password updated. Other sessions have been signed out.' });
    },
  };
}
