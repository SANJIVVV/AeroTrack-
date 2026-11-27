/**
 * BAGGAGE ROUTES
 * --------------
 * Express router mapping baggage endpoints to baggageController actions.
 */
import { Router } from 'express';
import { requireAuth, requireRole, requireVerified } from '../middleware/auth.js';
import { createBaggageController, loadAccessibleBag } from '../controllers/baggageController.js';

export { loadAccessibleBag };

export function baggageRoutes(ctx) {
  const r = Router();
  const ctrl = createBaggageController(ctx);

  r.use(requireAuth);

  // Passengers list their own bags; Staff search all luggage
  r.get('/', ctrl.listBaggage);

  // Operations board active feed (Staff & Admin only)
  r.get('/board', requireRole('staff', 'admin'), ctrl.getBoard);

  // Register new luggage for a scheduled flight
  r.post('/', requireVerified, ctrl.registerBaggage);

  // Luggage detail, chronological events, QR tag, and delay risk
  r.get('/:ref', ctrl.getBaggageByRef);
  r.get('/:ref/events', ctrl.getBaggageEvents);
  r.get('/:ref/qr', ctrl.getBaggageQr);
  r.get('/:ref/prediction', ctrl.getBaggagePrediction);

  // Journey progression status updates (Staff & Admin only)
  r.patch('/:ref/status', requireRole('staff', 'admin'), ctrl.updateStatus);
  r.post('/:ref/events', requireRole('staff', 'admin'), ctrl.updateStatus);

  // Administrative override (audited correction flow)
  r.post('/:ref/override', requireRole('admin'), ctrl.overrideStatus);

  // Cancel un-checked-in baggage registration
  r.delete('/:ref', ctrl.deleteBaggage);

  return r;
}
