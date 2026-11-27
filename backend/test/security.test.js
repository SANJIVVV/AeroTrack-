import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { requireCsrfHeader } from '../src/middleware/security.js';

test('security: bcrypt password hashing and constant-time verification', async () => {
  const password = 'StrongPassword123!';
  const hash = await bcrypt.hash(password, 10);

  assert.ok(hash.startsWith('$2'));
  assert.notEqual(hash, password);

  const isMatch = await bcrypt.compare(password, hash);
  assert.equal(isMatch, true);

  const isWrongMatch = await bcrypt.compare('WrongPassword456!', hash);
  assert.equal(isWrongMatch, false);
});

test('security: requireCsrfHeader allows safe methods and enforces X-Requested-With on mutations', () => {
  const makeReq = (method, headers = {}) => ({
    method,
    headers,
    get: (header) => headers[header.toLowerCase()],
  });

  // Safe method GET should pass through
  let nextCalled = false;
  requireCsrfHeader(makeReq('GET'), {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  // Unsafe method POST without header should be rejected
  let thrownErr = null;
  try {
    requireCsrfHeader(makeReq('POST'), {}, () => {});
  } catch (err) {
    thrownErr = err;
  }
  assert.ok(thrownErr);
  assert.equal(thrownErr.status, 403);
  assert.equal(thrownErr.code, 'CSRF');

  // Unsafe method POST with x-requested-with = 'aerotrack' header should pass
  let postPassed = false;
  requireCsrfHeader(makeReq('POST', { 'x-requested-with': 'aerotrack' }), {}, () => {
    postPassed = true;
  });
  assert.equal(postPassed, true);
});
