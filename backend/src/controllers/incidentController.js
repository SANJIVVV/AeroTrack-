/**
 * INCIDENT CONTROLLER
 * -------------------
 * Handles passenger baggage incident reporting and resolution:
 * - Listing incidents (passenger reports / staff overview)
 * - Filing new incident reports (missing, damaged, delayed)
 * - Fetching incident details
 * - Patching incident status and notes (Staff only)
 */
import { z } from 'zod';
import { INCIDENT_STATUSES, INCIDENT_TYPES } from '@aerotrack/shared';
import { Incident } from '../models/index.js';
import { isStaff } from '../middleware/auth.js';
import { demoScope, objectId, pagination, parse } from '../validators/common.js';
import { loadAccessibleBag } from './baggageController.js';
import { notFound, conflict } from '../utils/errors.js';
import { notify } from '../services/notifications.js';
import { audit } from '../services/audit.js';
import { changeStatus } from '../services/tracking.js';

function toIncidentDTO(i, showNames) {
  return {
    id: String(i._id),
    type: i.type,
    status: i.status,
    description: i.description,
    reference: i.baggage?.reference ?? null,
    baggageDescription: i.baggage?.description ?? null,
    reporterName: showNames ? (i.reporter?.name ?? null) : undefined,
    history: (i.history ?? []).map((h) => ({ byName: h.byName, text: h.text, status: h.status, at: h.at })),
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    isDemo: !!i.isDemo,
  };
}

export function createIncidentController(ctx) {
  return {
    async listIncidents(req, res) {
      const q = parse(pagination.extend({ status: z.enum(INCIDENT_STATUSES).optional(), type: z.enum(INCIDENT_TYPES).optional(), scope: demoScope }), req.query);
      const filter = {};
      const staff = isStaff(req.user);
      if (!staff) filter.reporter = req.user._id;
      else if (q.scope !== 'all') filter.isDemo = q.scope === 'demo';
      if (q.status) filter.status = q.status;
      if (q.type) filter.type = q.type;
      const [items, total] = await Promise.all([
        Incident.find(filter)
          .sort({ updatedAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .populate('baggage', 'reference description')
          .populate('reporter', 'name')
          .lean(),
        Incident.countDocuments(filter),
      ]);
      res.json({ items: items.map((i) => toIncidentDTO(i, staff)), page: q.page, pageSize: q.pageSize, total });
    },

    async createIncident(req, res) {
      const body = parse(z.object({ reference: z.string().trim(), type: z.enum(INCIDENT_TYPES), description: z.string().trim().min(10).max(1000) }), req.body);
      const bag = await loadAccessibleBag(req, body.reference);
      const open = await Incident.findOne({ baggage: bag._id, status: { $in: ['OPEN', 'INVESTIGATING'] } });
      if (open) throw conflict('OPEN_INCIDENT_EXISTS', 'An open incident already exists for this bag.');

      const inc = await Incident.create({
        baggage: bag._id,
        reporter: req.user._id,
        type: body.type,
        description: body.description,
        isDemo: bag.isDemo,
      });
      await audit(req.user, 'incident.created', { type: 'incident', id: String(inc._id) }, { baggage: bag.reference });

      if (['MISSING', 'DAMAGED'].includes(body.type) && bag.status !== 'COLLECTED') {
        const target = body.type === 'MISSING' ? 'MISSING' : 'INCIDENT_REPORTED';
        await changeStatus(ctx, req.user, bag, target, `Passenger reported incident: ${body.type}`, 'incident');
      }

      await inc.populate('baggage', 'reference description');
      res.status(201).json({ incident: toIncidentDTO(inc, isStaff(req.user)) });
    },

    async getIncidentById(req, res) {
      const id = parse(objectId, req.params.id);
      const inc = await Incident.findById(id).populate('baggage', 'reference description').populate('reporter', 'name');
      if (!inc) throw notFound('Incident');
      if (!isStaff(req.user) && String(inc.reporter?._id ?? inc.reporter) !== String(req.user._id)) throw notFound('Incident');
      res.json({ incident: toIncidentDTO(inc, isStaff(req.user)) });
    },

    async patchIncident(req, res) {
      const id = parse(objectId, req.params.id);
      const body = parse(z.object({ status: z.enum(INCIDENT_STATUSES), note: z.string().trim().max(1000).optional() }), req.body);
      const inc = await Incident.findById(id).populate('baggage');
      if (!inc) throw notFound('Incident');
      inc.status = body.status;
      inc.history.push({ by: req.user._id, byName: req.user.name, text: body.note ?? '', status: body.status, at: ctx.now() });
      await inc.save();
      await audit(req.user, 'incident.updated', { type: 'incident', id: String(inc._id) }, body);
      await notify(ctx, {
        userId: inc.reporter,
        kind: 'INCIDENT_UPDATE',
        title: `Incident ${body.status.toLowerCase()}`,
        body: `Your incident for bag ${inc.baggage?.reference ?? ''} is now ${body.status.toLowerCase()}${body.note ? `: "${body.note}"` : '.'}`,
        link: `/incidents/${inc._id}`,
        dedupeKey: `inc:${inc._id}:${body.status}`,
        isDemo: inc.isDemo,
      });
      res.json({ incident: toIncidentDTO(inc, true) });
    },
  };
}
