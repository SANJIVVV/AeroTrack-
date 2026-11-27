/**
 * FLIGHT CONTROLLER
 * -----------------
 * Handles flight roster queries and manual flight schedule creation:
 * - Querying flights (search by number/origin/dest, filter by airline or demo scope)
 * - Fetching flight details with baggage counts
 * - Manual flight entry by staff/admins
 * - Flight status updates
 */
import { z } from 'zod';
import { FLIGHT_STATUSES, findAirline } from '@aerotrack/shared';
import { Baggage, Flight } from '../models/index.js';
import { demoScope, escapeRegex, objectId, pagination, parse } from '../validators/common.js';
import { toFlightDTO } from '../services/serializers.js';
import { audit } from '../services/audit.js';
import { notFound } from '../utils/errors.js';

export function createFlightController(ctx) {
  return {
    async listFlights(req, res) {
      const q = parse(
        pagination.extend({
          search: z.string().trim().max(20).optional(),
          airline: z.string().trim().max(3).optional(),
          scope: demoScope.default('all'),
          upcoming: z.enum(['true', 'false']).optional(),
        }),
        req.query,
      );
      const filter = {};
      if (q.scope !== 'all') filter.isDemo = q.scope === 'demo';
      if (q.airline) filter.airlineCode = q.airline.toUpperCase();
      if (q.search) {
        const rx = new RegExp(escapeRegex(q.search), 'i');
        filter.$or = [{ flightNumber: rx }, { origin: rx }, { destination: rx }, { airlineName: rx }];
      }
      if (q.upcoming === 'true') filter.scheduledDeparture = { $gte: new Date(ctx.now().getTime() - 6 * 3600_000) };
      let [items, total] = await Promise.all([
        Flight.find(filter)
          .sort({ scheduledDeparture: 1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        Flight.countDocuments(filter),
      ]);

      // Fallback: If upcoming filter was requested for an airline but returned 0 items,
      // return the available demo flights for that airline so dropdowns always function
      if (items.length === 0 && q.upcoming === 'true' && q.airline) {
        const fallbackFilter = { airlineCode: q.airline.toUpperCase() };
        if (q.scope !== 'all') fallbackFilter.isDemo = q.scope === 'demo';
        items = await Flight.find(fallbackFilter).sort({ scheduledDeparture: 1 }).limit(q.pageSize).lean();
        total = items.length;
      }

      res.json({ items: items.map(toFlightDTO), page: q.page, pageSize: q.pageSize, total });
    },

    async getFlightById(req, res) {
      const id = parse(objectId, req.params.id);
      const flight = await Flight.findById(id).lean();
      if (!flight) throw notFound('Flight');
      const baggageCount = req.user.role === 'passenger' ? await Baggage.countDocuments({ flight: id, owner: req.user._id }) : await Baggage.countDocuments({ flight: id });
      res.json({ flight: toFlightDTO(flight), baggageCount, airline: findAirline(flight.airlineCode) ?? null });
    },

    async createFlight(req, res) {
      const body = parse(
        z.object({
          airlineCode: z.string().trim().min(2).max(3).toUpperCase(),
          airlineName: z.string().trim().min(2).max(100),
          flightNumber: z.string().trim().min(3).max(10).toUpperCase(),
          origin: z.string().trim().min(3).max(4).toUpperCase(),
          destination: z.string().trim().min(3).max(4).toUpperCase(),
          scheduledDeparture: z.string().datetime(),
          scheduledArrival: z.string().datetime(),
        }),
        req.body,
      );
      const flight = await Flight.create({
        ...body,
        scheduledDeparture: new Date(body.scheduledDeparture),
        scheduledArrival: new Date(body.scheduledArrival),
        status: 'SCHEDULED',
        source: 'manual',
        isDemo: false,
      });
      await audit(req.user, 'flight.created', { type: 'flight', id: flight.flightNumber });
      res.status(201).json({ flight: toFlightDTO(flight) });
    },

    async patchFlightStatus(req, res) {
      const id = parse(objectId, req.params.id);
      const body = parse(z.object({ status: z.enum(FLIGHT_STATUSES) }), req.body);
      const flight = await Flight.findOneAndUpdate({ _id: id, isDemo: false }, { status: body.status }, { new: true });
      if (!flight) throw notFound('Flight');
      await audit(req.user, 'flight.status_changed', { type: 'flight', id: flight.flightNumber }, body);
      res.json({ flight: toFlightDTO(flight) });
    },
  };
}
