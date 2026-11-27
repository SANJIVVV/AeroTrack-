/**
 * SCAN ROUTES
 * -----------
 * Express router mapping barcode scanning endpoints to scanController actions.
 */
import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { createScanController } from '../controllers/scanController.js';

export function scanRoutes(ctx, limiters) {
  const r = Router();
  const ctrl = createScanController(ctx);

  r.use(requireRole('staff', 'admin'));

  // Optical checkpoint scan submission
  r.post('/', limiters.scan, ctrl.processScanHandler);

  // Ground staff recent scan activity feed
  r.get('/recent', ctrl.getRecentScans);

  return r;
}
