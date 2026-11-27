/**
 * INCIDENT ROUTES
 * ---------------
 * Express router mapping baggage claim incidents to incidentController actions.
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createIncidentController } from '../controllers/incidentController.js';

export function incidentRoutes(ctx) {
  const r = Router();
  const ctrl = createIncidentController(ctx);

  r.use(requireAuth);

  // List incidents
  r.get('/', ctrl.listIncidents);

  // File new incident claim
  r.post('/', ctrl.createIncident);

  // Fetch incident detail
  r.get('/:id', ctrl.getIncidentById);

  // Update incident status (Staff & Admin only)
  r.patch('/:id', requireRole('staff', 'admin'), ctrl.patchIncident);

  return r;
}
