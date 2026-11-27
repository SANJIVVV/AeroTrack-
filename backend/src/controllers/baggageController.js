/**
 * BAGGAGE CONTROLLER
 * ------------------
 * Handles HTTP requests and responses for luggage operations:
 * - List baggage (passenger scope / staff search)
 * - Operations board active luggage feed
 * - Baggage registration with CSPRNG reference generation
 * - Baggage detail lookup
 * - Checkpoint scan events history
 * - QR code SVG generation
 * - Delay-risk estimation retrieval
 * - Status transition updates (with optimistic concurrency locking)
 * - Administrative status overrides
 * - Baggage cancellation (pre-check-in)
 */
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { BAGGAGE_STATUSES, allowedNextStatuses, generateReference, nextMainStep, normalizeReference, toQrPayload } from '@aerotrack/shared';
import { Baggage, BaggageEvent, Flight } from '../models/index.js';
import { isStaff } from '../middleware/auth.js';
import { demoScope, escapeRegex, objectId, pagination, parse } from '../validators/common.js';
import { toBaggageDTO, toEventDTO } from '../services/serializers.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { estimateDelay } from '../services/prediction.js';
import { changeStatus, overrideStatus } from '../services/tracking.js';

export async function loadAccessibleBag(req, refParam) {
  const ref = normalizeReference(refParam);
  if (!ref) throw notFound('Baggage');
  const bag = await Baggage.findOne({ reference: ref }).populate('flight').populate('lastCheckpoint').populate('owner', 'name');
  if (!bag) throw notFound('Baggage');
  const ownerId = String(bag.owner?._id ?? bag.owner);
  if (!isStaff(req.user) && ownerId !== String(req.user._id)) throw notFound('Baggage');
  return bag;
}

export function createBaggageController(ctx) {
  return {
    async listBaggage(req, res) {
      const q = parse(
        pagination.extend({
          search: z.string().trim().max(60).optional(),
          status: z.string().trim().optional(),
          flight: objectId.optional(),
          scope: demoScope,
        }),
        req.query,
      );
      const filter = {};
      const staff = isStaff(req.user);
      if (!staff) filter.owner = req.user._id;
      else if (q.scope !== 'all') filter.isDemo = q.scope === 'demo';
      if (q.status) {
        const statuses = q.status.split(',').map((s) => s.trim()).filter((s) => BAGGAGE_STATUSES.includes(s));
        if (statuses.length === 1) filter.status = statuses[0];
        else if (statuses.length > 1) filter.status = { $in: statuses };
      }
      if (q.flight) filter.flight = q.flight;
      if (q.search) {
        const rx = new RegExp(escapeRegex(q.search), 'i');
        filter.$or = [{ reference: rx }, { description: rx }];
      }
      const [items, total] = await Promise.all([
        Baggage.find(filter)
          .sort({ updatedAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .populate('flight')
          .populate('lastCheckpoint')
          .populate('owner', 'name')
          .lean(),
        Baggage.countDocuments(filter),
      ]);
      res.json({ items: items.map((b) => toBaggageDTO(b, { includeOwner: staff })), page: q.page, pageSize: q.pageSize, total });
    },

    async getBoard(req, res) {
      const q = parse(z.object({ scope: demoScope }), req.query);
      const filter = { $or: [{ status: { $ne: 'COLLECTED' } }, { updatedAt: { $gte: new Date(ctx.now().getTime() - 24 * 3600_000) } }] };
      if (q.scope !== 'all') filter.isDemo = q.scope === 'demo';
      const items = await Baggage.find(filter).sort({ updatedAt: -1 }).limit(300).populate('flight').populate('lastCheckpoint').populate('owner', 'name').lean();
      res.json({ items: items.map((b) => toBaggageDTO(b, { includeOwner: true })) });
    },

    async registerBaggage(req, res) {
      const body = parse(
        z.object({
          description: z.string().trim().min(3).max(200),
          color: z.string().trim().max(40).optional(),
          weightKg: z.number().min(0).max(100).optional(),
          flightId: objectId,
        }),
        req.body,
      );
      const flight = await Flight.findById(body.flightId);
      if (!flight) throw badRequest('Flight not found.');
      if (['LANDED', 'CANCELLED', 'DEPARTED', 'IN_AIR'].includes(flight.status)) throw badRequest(`This flight is ${flight.status.toLowerCase()}; baggage cannot be registered.`);
      const count = await Baggage.countDocuments({ owner: req.user._id, flight: flight._id });
      if (count >= 10) throw conflict('LIMIT', 'You can register up to 10 bags per flight.');

      let bag;
      for (let attempt = 0; attempt < 5 && !bag; attempt++) {
        try {
          bag = await Baggage.create({
            reference: generateReference((n) => randomBytes(n)),
            owner: req.user._id,
            flight: flight._id,
            description: body.description,
            color: body.color ?? '',
            weightKg: body.weightKg ?? null,
            isDemo: flight.isDemo,
          });
        } catch (err) {
          if (err.code !== 11000) throw err;
        }
      }
      if (!bag) throw conflict('REFERENCE', 'Could not allocate a baggage reference. Please retry.');
      await BaggageEvent.create({
        baggage: bag._id,
        status: 'REGISTERED',
        actor: req.user._id,
        actorRole: req.user.role,
        method: 'system',
        note: 'Registered by passenger',
        occurredAt: ctx.now(),
        isDemo: bag.isDemo,
        source: bag.isDemo ? 'simulated' : 'verified',
      });
      await audit(req.user, 'baggage.registered', { type: 'baggage', id: bag.reference }, {}, bag.isDemo);
      await bag.populate('flight');
      res.status(201).json({ baggage: toBaggageDTO(bag) });
    },

    async getBaggageByRef(req, res) {
      const bag = await loadAccessibleBag(req, String(req.params.ref));
      res.json({
        baggage: toBaggageDTO(bag, { includeOwner: isStaff(req.user) }),
        nextStep: nextMainStep(bag.lastMainStatus),
        allowedNext: isStaff(req.user) ? allowedNextStatuses(bag.status, bag.lastMainStatus) : [],
      });
    },

    async getBaggageEvents(req, res) {
      const bag = await loadAccessibleBag(req, String(req.params.ref));
      const events = await BaggageEvent.find({ baggage: bag._id }).sort({ occurredAt: 1, _id: 1 }).populate('checkpoint').populate('actor', 'name').lean();
      res.json({ items: events.map((e) => toEventDTO(e, { showActor: isStaff(req.user) })) });
    },

    async getBaggageQr(req, res) {
      const bag = await loadAccessibleBag(req, String(req.params.ref));
      const payload = toQrPayload(bag.reference);
      const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
      res.json({ reference: bag.reference, payload, svg });
    },

    async getBaggagePrediction(req, res) {
      const bag = await loadAccessibleBag(req, String(req.params.ref));
      res.json({ prediction: await estimateDelay(ctx, bag) });
    },

    async updateStatus(req, res) {
      const body = parse(z.object({ status: z.enum(BAGGAGE_STATUSES), note: z.string().trim().max(500).optional(), source: z.enum(['board', 'form']).optional() }), req.body);
      const bag = await loadAccessibleBag(req, String(req.params.ref));
      const v = req.get('If-Match');
      const clientVersion = v && /^\d+$/.test(v) ? Number(v) : null;
      if (body.status !== bag.status && clientVersion !== null && clientVersion !== bag.version) {
        throw conflict('STALE', 'This bag changed since you loaded it. Refresh and try again.');
      }
      const { bag: updated, event } = await changeStatus(ctx, req.user, bag, body.status, body.note, body.source === 'board' ? 'board' : 'status-update');
      await updated.populate('lastCheckpoint');
      res.json({ baggage: toBaggageDTO(updated, { includeOwner: true }), event: { id: String(event._id), status: event.status, previousStatus: event.previousStatus, occurredAt: event.occurredAt } });
    },

    async overrideStatus(req, res) {
      const body = parse(z.object({ status: z.enum(BAGGAGE_STATUSES), reason: z.string().trim().min(10, 'Give a reason of at least 10 characters.').max(500) }), req.body);
      const bag = await loadAccessibleBag(req, String(req.params.ref));
      const { bag: updated } = await overrideStatus(ctx, req.user, bag, body.status, body.reason);
      await updated.populate('lastCheckpoint');
      res.json({ baggage: toBaggageDTO(updated, { includeOwner: true }) });
    },

    async deleteBaggage(req, res) {
      const bag = await loadAccessibleBag(req, String(req.params.ref));
      if (bag.status !== 'REGISTERED') throw conflict('NOT_CANCELLABLE', 'Only bags that have not been checked in can be removed.');
      await BaggageEvent.deleteMany({ baggage: bag._id });
      await bag.deleteOne();
      await audit(req.user, 'baggage.deleted', { type: 'baggage', id: bag.reference }, {}, bag.isDemo);
      res.status(204).end();
    },
  };
}
