/**
 * NOTIFICATION CONTROLLER
 * -----------------------
 * Handles in-app notifications and alerts inbox:
 * - Querying user notifications with unread counter
 * - Marking notifications as read (batch or all)
 */
import { z } from 'zod';
import { Notification } from '../models/index.js';
import { objectId, pagination, parse } from '../validators/common.js';

export function createNotificationController(_ctx) {
  return {
    async listNotifications(req, res) {
      const q = parse(pagination.extend({ unread: z.enum(['true', 'false']).optional() }), req.query);
      const filter = { user: req.user._id };
      if (q.unread === 'true') filter.readAt = null;
      const [items, total, unread] = await Promise.all([
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip((q.page - 1) * q.pageSize)
          .limit(q.pageSize)
          .lean(),
        Notification.countDocuments(filter),
        Notification.countDocuments({ user: req.user._id, readAt: null }),
      ]);
      res.json({
        items: items.map((n) => ({
          id: String(n._id),
          kind: n.kind,
          title: n.title,
          body: n.body,
          link: n.link,
          readAt: n.readAt,
          createdAt: n.createdAt,
          emailStatus: n.email?.status ?? 'skipped',
          isDemo: n.isDemo,
        })),
        page: q.page,
        pageSize: q.pageSize,
        total,
        unread,
      });
    },

    async markRead(req, res) {
      const body = parse(z.object({ ids: z.array(objectId).max(100).optional(), all: z.boolean().optional() }), req.body);
      const filter = { user: req.user._id, readAt: null };
      if (!body.all) filter._id = { $in: body.ids ?? [] };
      const result = await Notification.updateMany(filter, { readAt: new Date() });
      res.json({ updated: result.modifiedCount });
    },
  };
}
