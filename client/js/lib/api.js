/**
 * Thin fetch wrapper for the AeroTrack API, with local read-only responses
 * for navigation demos that run without a backend.
 */

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Empty means the API is expected at the same origin when demo mode is off.
const BASE = window.AEROTRACK_API_BASE ?? '';

function demoResponse(path, method) {
  if (method !== 'GET') {
    throw new ApiError(501, 'DEMO_READ_ONLY', 'This demo is for page navigation only. Connect an API to save changes.');
  }

  const route = path.split('?')[0];
  if (route === '/auth/me') return { user: null, emailMode: null };
  if (route === '/admin/stats') return { users: 3, readyForCollection: 0, delayed: 0, missing: 0, recent: [] };
  if (route === '/admin/analytics') {
    return {
      byStatus: {},
      anomaliesByType: {},
      kpis: { totalBaggage: 0, inProgress: 0, inTransit: 0, collected: 0, delayed: 0, missing: 0, openIncidents: 0, activeAlerts: 0, scanFailures: 0 },
      checkpointActivity: [],
      scansPerDay: [],
      processingTrend: [],
    };
  }

  const listRoutes = new Set([
    '/admin/audit',
    '/admin/users',
    '/airlines',
    '/alerts',
    '/baggage',
    '/checkpoints',
    '/flights',
    '/incidents',
    '/notifications',
    '/scans/recent',
  ]);
  if (listRoutes.has(route)) return { items: [], total: 0, page: 1, pageSize: 20, unread: 0 };

  throw new ApiError(404, 'DEMO_NAVIGATION_ONLY', 'This page needs a compatible API. Demo mode supports navigation only.');
}

function withQuery(path, query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}

export async function api(path, opts = {}) {
  const method = opts.method ?? 'GET';
  if (window.AEROTRACK_DEMO_MODE === true) return demoResponse(path, method);

  let res;
  try {
    res = await fetch(`${BASE}/api${withQuery(path, opts.query)}`, {
      method,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'aerotrack',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', navigator.onLine ? 'Cannot reach the AeroTrack server. Is it running?' : 'You appear to be offline.');
  }
  if (res.status === 204) return undefined;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Request failed (${res.status}).`, e?.details);
  }
  return data;
}

export const get = (path, query) => api(path, { query });
export const post = (path, body) => api(path, { method: 'POST', body: body ?? {} });
export const patch = (path, body) => api(path, { method: 'PATCH', body: body ?? {} });
export const del = (path) => api(path, { method: 'DELETE' });

export function errorMessage(err) {
  if (err instanceof ApiError) {
    const details = Array.isArray(err.details) ? err.details : [];
    return details.length ? `${err.message} ${details.map((d) => `${d.field ? `${d.field}: ` : ''}${d.message}`).join('; ')}` : err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
