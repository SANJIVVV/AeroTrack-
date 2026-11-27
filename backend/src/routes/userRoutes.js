/**
 * USER ROUTES
 * -----------
 * Express router mapping user profile and security preferences to userController actions.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createUserController } from '../controllers/userController.js';

export function userRoutes(ctx) {
  const r = Router();
  const ctrl = createUserController(ctx);

  r.use(requireAuth);

  // Profile and notification preferences
  r.patch('/me', ctrl.updateMe);

  // Authenticated password update
  r.post('/me/password', ctrl.changePassword);

  return r;
}
