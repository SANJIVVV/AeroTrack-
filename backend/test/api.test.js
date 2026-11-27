import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('api: health check endpoint returns 200 and system status', async () => {
  const mockCtx = {
    env: {
      NODE_ENV: 'test',
      PORT: 4000,
      MONGODB_URI: 'mongodb://localhost:27017/aerotrack_test',
      MONGODB_DB_NAME: 'aerotrack_test',
      CLIENT_URL: 'http://localhost:4000',
      SESSION_SECRET: '0123456789012345678901234567890123456789',
      COOKIE_SAMESITE: 'lax',
      EMAIL_PROVIDER: 'dev',
    },
    email: { mode: 'dev', send: async () => {} },
    delayModel: null,
    now: () => new Date(),
  };

  const app = createApp(mockCtx, { disableRateLimit: true });

  const server = app.listen(0);
  const address = server.address();
  const port = address.port;

  try {
    const resLive = await fetch(`http://localhost:${port}/api/health/live`);
    assert.equal(resLive.status, 200);
    const bodyLive = await resLive.json();
    assert.equal(bodyLive.status, 'ok');

    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.ok(res.status === 200 || res.status === 503, `Unexpected status ${res.status}`);

    const body = await res.json();
    assert.ok(body.status === 'ok' || body.status === 'degraded');
    assert.ok('database' in body);
    assert.ok('email' in body);
    assert.ok('flights' in body);
    assert.ok('delayModel' in body);
    assert.ok('time' in body);
  } finally {
    server.close();
  }
});

test('api: returns 404 for unknown api endpoint', async () => {
  const mockCtx = {
    env: {
      NODE_ENV: 'test',
      PORT: 4000,
      MONGODB_URI: 'mongodb://localhost:27017/aerotrack_test',
      MONGODB_DB_NAME: 'aerotrack_test',
      CLIENT_URL: 'http://localhost:4000',
      SESSION_SECRET: '0123456789012345678901234567890123456789',
      COOKIE_SAMESITE: 'lax',
      EMAIL_PROVIDER: 'dev',
    },
    email: { mode: 'dev', send: async () => {} },
    delayModel: null,
    now: () => new Date(),
  };

  const app = createApp(mockCtx, { disableRateLimit: true });
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/api/nonexistent-route-12345`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
