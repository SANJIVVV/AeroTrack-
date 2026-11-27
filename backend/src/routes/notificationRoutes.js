/**
 * NOTIFICATION ROUTES
 * -------------------
 * Express router mapping notification inbox endpoints to notificationController actions.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createNotificationController } from '../controllers/notificationController.js';

export function notificationRoutes(ctx) {
  const r = Router();
  const ctrl = createNotificationController(ctx);

  r.use(requireAuth);

  // List notifications
  r.get('/', ctrl.listNotifications);

  // Mark notifications as read
  r.post('/read', ctrl.markRead);

  return r;
}
