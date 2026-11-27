import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAIN_FLOW,
  EXCEPTION_STATUSES,
  BAGGAGE_STATUSES,
  checkTransition,
  allowedNextStatuses,
  nextMainStep,
  isMainFlow,
  isException,
} from '../src/status.js';

test('status constants and helpers', () => {
  assert.equal(MAIN_FLOW.length, 8);
  assert.equal(MAIN_FLOW[0], 'REGISTERED');
  assert.equal(MAIN_FLOW[MAIN_FLOW.length - 1], 'COLLECTED');
  assert.equal(EXCEPTION_STATUSES.length, 3);
  assert.equal(BAGGAGE_STATUSES.length, MAIN_FLOW.length + EXCEPTION_STATUSES.length);

  assert.ok(isMainFlow('CHECKED_IN'));
  assert.ok(!isMainFlow('DELAYED'));

  assert.ok(isException('DELAYED'));
  assert.ok(isException('MISSING'));
  assert.ok(isException('INCIDENT_REPORTED'));
  assert.ok(!isException('CHECKED_IN'));

  const nextOptions = allowedNextStatuses('CHECKED_IN', 'CHECKED_IN');
  assert.ok(nextOptions.includes('SECURITY_SCREENING'));
  assert.ok(nextOptions.includes('DELAYED'));
  assert.ok(!nextOptions.includes('REGISTERED'));
});

test('checkTransition: valid main flow progression', () => {
  const t1 = checkTransition('REGISTERED', 'CHECKED_IN', 'REGISTERED');
  assert.equal(t1.ok, true);
  assert.deepEqual(t1.skipped, []);

  const t2 = checkTransition('CHECKED_IN', 'SECURITY_SCREENING', 'CHECKED_IN');
  assert.equal(t2.ok, true);
  assert.deepEqual(t2.skipped, []);
});

test('checkTransition: forward skip detection', () => {
  // Skipping SECURITY_SCREENING to LOADED
  const t = checkTransition('CHECKED_IN', 'LOADED', 'CHECKED_IN');
  assert.equal(t.ok, true);
  assert.deepEqual(t.skipped, ['SECURITY_SCREENING']);
});

test('checkTransition: backward transitions rejected', () => {
  const t = checkTransition('LOADED', 'CHECKED_IN', 'LOADED');
  assert.equal(t.ok, false);
  assert.equal(t.reason, 'BACKWARD');
});

test('checkTransition: same status rejected for normal status', () => {
  const t = checkTransition('LOADED', 'LOADED', 'LOADED');
  assert.equal(t.ok, false);
  assert.equal(t.reason, 'SAME_STATUS');
});

test('checkTransition: exceptions and resuming from exceptions', () => {
  // Moving to exception DELAYED is allowed from any non-terminal state
  const t1 = checkTransition('IN_TRANSIT', 'DELAYED', 'IN_TRANSIT');
  assert.equal(t1.ok, true);

  // Resuming from DELAYED back to ARRIVED (forward from lastMain IN_TRANSIT)
  const t2 = checkTransition('DELAYED', 'ARRIVED', 'IN_TRANSIT');
  assert.equal(t2.ok, true);

  // Resuming back to same lastMain status is allowed
  const t3 = checkTransition('DELAYED', 'IN_TRANSIT', 'IN_TRANSIT');
  assert.equal(t3.ok, true);

  // Moving backward from lastMain is rejected
  const t4 = checkTransition('DELAYED', 'CHECKED_IN', 'IN_TRANSIT');
  assert.equal(t4.ok, false);
  assert.equal(t4.reason, 'BACKWARD');
});

test('checkTransition: terminal state COLLECTED', () => {
  // Terminal status cannot transition to other main statuses
  const t1 = checkTransition('COLLECTED', 'IN_TRANSIT', 'COLLECTED');
  assert.equal(t1.ok, false);
  assert.equal(t1.reason, 'TERMINAL');

  // Can file an incident on collected baggage
  const t2 = checkTransition('COLLECTED', 'INCIDENT_REPORTED', 'COLLECTED');
  assert.equal(t2.ok, true);
});

test('nextMainStep', () => {
  assert.equal(nextMainStep('REGISTERED'), 'CHECKED_IN');
  assert.equal(nextMainStep('CHECKED_IN'), 'SECURITY_SCREENING');
  assert.equal(nextMainStep('ON_BELT'), 'COLLECTED');
  assert.equal(nextMainStep('COLLECTED'), null);
});
