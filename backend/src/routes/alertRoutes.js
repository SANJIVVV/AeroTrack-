/**
 * ALERT ROUTES
 * ------------
 * Express router mapping anomaly alert endpoints to alertController actions.
 */
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { createAlertController } from '../controllers/alertController.js';

export function alertRoutes(ctx) {
  const r = Router();
  const ctrl = createAlertController(ctx);

  r.use(requireRole('staff', 'admin'));

  // Alert listing with filters
  r.get('/', ctrl.listAlerts);

  // Status transition (acknowledge, investigate, resolve)
  r.patch('/:id', ctrl.patchAlert);

  // Trigger manual dwell-time anomaly sweep
  r.post('/sweep', ctrl.triggerSweep);

  return r;
}
