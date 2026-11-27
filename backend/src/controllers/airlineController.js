/**
 * AIRLINE CONTROLLER
 * ------------------
 * Handles airline directory lookups:
 * - Querying airlines with search and region filters
 * - Fetching airline detail by code with demonstration flights
 */
import { z } from 'zod';
import { AIRLINE_REGIONS } from '@aerotrack/shared';
import { Airline, Flight } from '../models/index.js';
import { escapeRegex, parse } from '../validators/common.js';
import { toFlightDTO } from '../services/serializers.js';
import { notFound } from '../utils/errors.js';

const NOTICE = 'Demonstration directory. Not a partnership with, or live data from, any airline. Sample flights are generated for the demo.';

const toAirline = (a, featured = null) => ({
  code: a.code,
  name: a.name,
  country: a.country,
  region: a.region,
  hub: a.hub,
  description: a.description,
  officialSite: a.officialSite,
  image: a.image,
  photoMatchesAirline: !!a.photoMatchesAirline,
  featuredFlight: featured,
});

let cachedShowcase = null;
let cachedShowcaseUntil = 0;

export function invalidateAirlineCache() {
  cachedShowcase = null;
  cachedShowcaseUntil = 0;
}

export function createAirlineController(_ctx) {
  return {
    async listAirlines(req, res) {
      const q = parse(z.object({ search: z.string().trim().max(60).optional(), region: z.enum(AIRLINE_REGIONS).optional() }), req.query);

      // Fast path: In-memory cached showcase response for unfiltered browsing
      if (!q.search && !q.region && cachedShowcase && cachedShowcaseUntil > Date.now()) {
        return res.json(cachedShowcase);
      }

      const filter = { active: { $ne: false } };
      if (q.region) filter.region = q.region;
      if (q.search) {
        const rx = new RegExp(escapeRegex(q.search), 'i');
        filter.$or = [{ name: rx }, { country: rx }, { code: rx }];
      }
      const items = await Airline.find(filter).sort({ name: 1 }).lean();
      const featured = await Flight.find({ isDemo: true, flightNumber: { $in: items.map((a) => a.featuredFlightNumber).filter(Boolean) } }).lean();
      const byNumber = new Map(featured.map((f) => [f.flightNumber, toFlightDTO(f)]));
      const result = { items: items.map((a) => toAirline(a, byNumber.get(a.featuredFlightNumber ?? '') ?? null)), notice: NOTICE };

      if (!q.search && !q.region) {
        cachedShowcase = result;
        cachedShowcaseUntil = Date.now() + 5 * 60_000;
      }

      res.json(result);
    },

    async getAirlineByCode(req, res) {
      const code = String(req.params.code).toUpperCase();
      const airline = await Airline.findOne({ code, active: { $ne: false } }).lean();
      if (!airline) throw notFound('Airline');
      const flights = await Flight.find({ isDemo: true, airlineCode: code }).sort({ scheduledDeparture: 1 }).limit(10).lean();
      res.json({ airline: toAirline(airline), flights: flights.map(toFlightDTO), notice: NOTICE });
    },
  };
}
