/**
 * CHECKPOINT ROUTES
 * -----------------
 * Express router mapping checkpoint station endpoints to checkpointController actions.
 */
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { createCheckpointController } from '../controllers/checkpointController.js';

export function checkpointRoutes(ctx) {
  const r = Router();
  const ctrl = createCheckpointController(ctx);

  r.use(requireRole('staff', 'admin'));

  // Station listing for staff and admin
  r.get('/', ctrl.listCheckpoints);

  // Station configuration and status toggling (Admin only)
  r.post('/', requireRole('admin'), ctrl.createCheckpoint);
  r.patch('/:id', requireRole('admin'), ctrl.patchCheckpoint);

  return r;
}
