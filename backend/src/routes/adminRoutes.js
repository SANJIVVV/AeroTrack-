/**
 * ADMIN ROUTES
 * ------------
 * Express router mapping administrative governance endpoints to adminController actions.
 */
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { createAdminController } from '../controllers/adminController.js';

export function adminRoutes(ctx) {
  const r = Router();
  const ctrl = createAdminController(ctx);

  // Operational analytics available to staff and administrators
  r.get('/analytics', requireRole('staff', 'admin'), ctrl.getAnalytics);

  // Restricted administrative endpoints
  r.use(requireRole('admin'));

  // User management and RBAC updates
  r.get('/users', ctrl.getUsers);
  r.patch('/users/:id', ctrl.patchUser);

  // Headline overview statistics
  r.get('/stats', ctrl.getStats);

  // Security audit trail
  r.get('/audit', ctrl.getAudit);
  r.get('/audit-logs', ctrl.getAudit);

  return r;
}
