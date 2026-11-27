/**
 * HEALTH CONTROLLER
 * -----------------
 * Handles system health and liveness/readiness diagnostic endpoints:
 * - /api/health/live: process liveness
 * - /api/health: database readiness and configuration mode diagnostics
 */
import { databaseState, pingDatabase } from '../config/db.js';

export function createHealthController(ctx) {
  return {
    getLive(_req, res) {
      res.json({ status: 'ok' });
    },

    async getReadiness(_req, res) {
      const dbOk = await pingDatabase();
      res.status(dbOk ? 200 : 503).json({
        status: dbOk ? 'ok' : 'degraded',
        database: { state: databaseState(), ping: dbOk },
        email: { mode: ctx.email.mode },
        flights: { source: 'sample-directory', live: false },
        delayModel: ctx.delayModel
          ? { method: 'logistic-regression', version: ctx.delayModel.version, dataOrigin: ctx.delayModel.dataOrigin }
          : { method: 'rules-baseline' },
        time: ctx.now().toISOString(),
      });
    },
  };
}
