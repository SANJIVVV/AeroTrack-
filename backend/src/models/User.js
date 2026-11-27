/**
 * USER MODEL
 * ----------
 * Mongoose schema for an AeroTrack Pro user account.
 * Supports three roles (from ROLES): passenger, staff, admin.
 * Key fields:
 * - name / email: display name and login identifier (email is unique, lowercased)
 * - passwordHash: bcrypt hash of the password (never stored in plain text; excluded from default queries)
 * - role: controls what pages and API endpoints the user can access
 * - emailVerified: whether the user has confirmed their email via OTP
 * - disabled: admin can deactivate an account without deleting it
 * - preferences: per-user notification settings (email and browser push)
 * - tutorialCompleted: tracks whether the onboarding tutorial has been seen
 * - isDemo: flag for demo accounts seeded for demonstration purposes
 * - lastLoginAt: timestamp of the most recent successful login
 */
import { Schema, model } from 'mongoose';
import { ROLES } from '@aerotrack/shared';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'passenger', index: true },
    emailVerified: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      browserNotifications: { type: Boolean, default: false },
    },
    tutorialCompleted: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false, index: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true });

export const User = model('User', userSchema);
