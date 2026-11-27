/**
 * AIRLINE ROUTES
 * --------------
 * Express router mapping airline directory endpoints to airlineController actions.
 */
import { Router } from 'express';
import { createAirlineController } from '../controllers/airlineController.js';

export function airlineRoutes(ctx) {
  const r = Router();
  const ctrl = createAirlineController(ctx);

  // Search airlines
  r.get('/', ctrl.listAirlines);

  // Airline detail by IATA code
  r.get('/:code', ctrl.getAirlineByCode);

  return r;
}
