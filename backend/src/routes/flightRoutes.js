/**
 * FLIGHT ROUTES
 * -------------
 * Express router mapping flight endpoints to flightController actions.
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createFlightController } from '../controllers/flightController.js';

export function flightRoutes(ctx) {
  const r = Router();
  const ctrl = createFlightController(ctx);

  // Search flights roster
  r.get('/', requireAuth, ctrl.listFlights);

  // Flight detail with baggage counts
  r.get('/:id', requireAuth, ctrl.getFlightById);

  // Manual flight creation (Staff & Admin only)
  r.post('/', requireRole('staff', 'admin'), ctrl.createFlight);

  // Flight status update (Staff & Admin only)
  r.patch('/:id/status', requireRole('staff', 'admin'), ctrl.patchFlightStatus);

  return r;
}
