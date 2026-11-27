/**
 * SCAN CONTROLLER
 * ---------------
 * Handles barcode scanning HTTP requests:
 * - Processing camera/hardware barcode scans at checkpoints
 * - Enforcing idempotency keys to avoid duplicate records
 * - Fetching recent scan logs for the ground staff feed
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BAGGAGE_STATUSES } from '@aerotrack/shared';
import { BaggageEvent } from '../models/index.js';
import { demoScope, pagination, parse } from '../validators/common.js';
import { processScan } from '../services/tracking.js';
import { toBaggageDTO } from '../services/serializers.js';
import { badRequest } from '../utils/errors.js';

export function createScanController(ctx) {
  return {
    async processScanHandler(req, res) {
      const body = parse(
        z.object({
          qrPayload: z.string().max(200).optional(),
          reference: z.string().max(40).optional(),
          checkpointCode: z.string().trim().min(1).max(32),
          status: z.enum(BAGGAGE_STATUSES).optional(),
          note: z.string().trim().max(500).optional(),
          idempotencyKey: z.string().uuid().optional(),
        }),
        req.body,
      );
      if (!body.qrPayload && !body.reference) throw badRequest('Provide a scanned QR payload or a baggage reference.');
      const result = await processScan(ctx, req.user, { ...body, idempotencyKey: body.idempotencyKey ?? randomUUID() });
      await result.bag.populate('lastCheckpoint');
      res.status(result.outcome === 'recorded' ? 201 : 200).json({
        outcome: result.outcome,
        baggage: toBaggageDTO(result.bag),
        findings: result.findings,
      });
    },

    async getRecentScans(req, res) {
      const q = parse(pagination.extend({ scope: demoScope }), req.query);
      const filter = { checkpoint: { $ne: null } };
      if (q.scope !== 'all') filter.isDemo = q.scope === 'demo';
      const [items, total] = await Promise.all([
        BaggageEvent.find(filter)
          .sort({ occurredAt: -1, _id: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .populate('checkpoint')
          .populate('actor', 'name')
          .populate('baggage', 'reference description isDemo')
          .lean(),
        BaggageEvent.countDocuments(filter),
      ]);
      res.json({
        items: items.map((e) => ({
          id: String(e._id),
          reference: e.baggage?.reference ?? null,
          description: e.baggage?.description ?? null,
          status: e.status,
          previousStatus: e.previousStatus,
          checkpointCode: e.checkpoint?.code ?? null,
          checkpointName: e.checkpoint?.name ?? null,
          actorName: e.actor?.name ?? null,
          method: e.method,
          occurredAt: e.occurredAt,
          isDemo: !!e.isDemo,
        })),
        page: q.page,
        pageSize: q.pageSize,
        total,
      });
    },
  };
}
