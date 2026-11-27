/**
 * HEALTH ROUTES
 * -------------
 * Express router mapping system health diagnostic endpoints to healthController actions.
 */
import { Router } from 'express';
import { createHealthController } from '../controllers/healthController.js';

export function healthRoutes(ctx) {
  const r = Router();
  const ctrl = createHealthController(ctx);

  // Liveness check
  r.get('/live', ctrl.getLive);

  // Database readiness and diagnostic status
  r.get('/', ctrl.getReadiness);

  return r;
}
