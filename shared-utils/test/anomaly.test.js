import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScan } from '../src/anomaly.js';

test('evaluateScan: detects duplicate scans within window', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const past50s = new Date('2026-11-20T09:59:10Z');

  const res = evaluateScan({
    bag: { status: 'CHECKED_IN', lastMainStatus: 'CHECKED_IN' },
    checkpoint: { code: 'MAA-CHK-01', type: 'CHECKIN_COUNTER', airport: 'MAA' },
    flight: null,
    recentEvents: [
      { checkpointCode: 'MAA-CHK-01', status: 'CHECKED_IN', occurredAt: past50s },
    ],
    now,
  });

  assert.equal(res.action, 'duplicate');
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0].type, 'DUPLICATE_SCAN');
});

test('evaluateScan: detects invalid backward transition', () => {
  const now = new Date('2026-11-20T10:00:00Z');

  const res = evaluateScan({
    bag: { status: 'LOADED', lastMainStatus: 'LOADED' },
    checkpoint: { code: 'MAA-CHK-01', type: 'CHECKIN_COUNTER', airport: 'MAA' },
    flight: null,
    recentEvents: [],
    now,
  });

  assert.equal(res.action, 'reject');
  assert.equal(res.reason, 'BACKWARD');
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0].type, 'INVALID_SEQUENCE');
});

test('evaluateScan: detects missing checkpoints (forward skip)', () => {
  const now = new Date('2026-11-20T10:00:00Z');

  // Jumping directly from CHECKED_IN to LOADED skips SECURITY_SCREENING
  const res = evaluateScan({
    bag: { status: 'CHECKED_IN', lastMainStatus: 'CHECKED_IN' },
    checkpoint: { code: 'MAA-LOAD-01', type: 'LOADING', airport: 'MAA' },
    flight: null,
    recentEvents: [],
    now,
  });

  assert.equal(res.action, 'record');
  assert.equal(res.status, 'LOADED');
  assert.equal(res.findings.length, 1);
  assert.equal(res.findings[0].type, 'MISSING_CHECKPOINT');
  assert.equal(res.findings[0].severity, 'high'); // SECURITY_SCREENING missed = high severity
});

test('evaluateScan: detects flight mismatch between airport and flight origin/dest', () => {
  const now = new Date('2026-11-20T10:00:00Z');

  // Checkpoint is at DEL, but bag is at origin stage of a flight originating at MAA
  const res = evaluateScan({
    bag: { status: 'REGISTERED', lastMainStatus: 'REGISTERED' },
    checkpoint: { code: 'DEL-CHK-01', type: 'CHECKIN_COUNTER', airport: 'DEL' },
    flight: { origin: 'MAA', destination: 'DEL' },
    recentEvents: [],
    now,
  });

  assert.equal(res.action, 'record');
  assert.ok(res.findings.some((f) => f.type === 'FLIGHT_MISMATCH'));
});
