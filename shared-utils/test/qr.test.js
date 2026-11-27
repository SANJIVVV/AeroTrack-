import test from 'node:test';
import assert from 'node:assert/strict';
import {
  secureRandomInt,
  generateRandomDigits,
  generateReference,
  toQrPayload,
  generateQrPayload,
  isReference,
  normalizeReference,
} from '../src/qr.js';

test('secureRandomInt: bounds and uniform generation', () => {
  // Test boundary conditions
  assert.equal(secureRandomInt(5, 5), 5);
  assert.throws(() => secureRandomInt(10, 2), RangeError);

  // Test 100 samples within range [0, 9]
  for (let i = 0; i < 100; i++) {
    const val = secureRandomInt(0, 9);
    assert.ok(val >= 0 && val <= 9, `Value ${val} out of range [0, 9]`);
  }

  // Test with custom randomSource
  const fakeSource = (bytes) => new Uint8Array([0x12, 0x34, 0x56, 0x78].slice(0, bytes));
  const valWithCustom = secureRandomInt(0, 100, fakeSource);
  assert.ok(valWithCustom >= 0 && valWithCustom <= 100);
});

test('generateRandomDigits: produces zero-padded digits of exact length', () => {
  for (let i = 0; i < 50; i++) {
    const d6 = generateRandomDigits(6);
    assert.equal(d6.length, 6);
    assert.match(d6, /^\d{6}$/);

    const d4 = generateRandomDigits(4);
    assert.equal(d4.length, 4);
    assert.match(d4, /^\d{4}$/);
  }
});

test('generateReference: format matches AT-<year>-<6 digits>', () => {
  const currentYear = new Date().getUTCFullYear();

  // Default call
  const ref1 = generateReference();
  assert.match(ref1, new RegExp(`^AT-${currentYear}-\\d{6}$`));
  assert.ok(isReference(ref1));

  // Custom year
  const ref2 = generateReference(2025);
  assert.match(ref2, /^AT-2025-\d{6}$/);
  assert.ok(isReference(ref2));

  // With randomBytes function (backward compatibility with backend caller)
  const fakeRandom = (n) => new Uint8Array([1, 2, 3, 4].slice(0, n));
  const ref3 = generateReference(fakeRandom, 2026);
  assert.match(ref3, /^AT-2026-\d{6}$/);
  assert.ok(isReference(ref3));
});

test('toQrPayload and generateQrPayload', () => {
  const ref = 'AT-2026-123456';
  const payload = toQrPayload(ref);
  assert.equal(payload, 'AEROTRACK:BAG:AT-2026-123456');

  const generated = generateQrPayload(undefined, 2026);
  assert.match(generated.reference, /^AT-2026-\d{6}$/);
  assert.equal(generated.payload, `AEROTRACK:BAG:${generated.reference}`);
});

test('normalizeReference: normalizes user input', () => {
  assert.equal(normalizeReference('  at-2026-123456  '), 'AT-2026-123456');
  assert.equal(normalizeReference('AT 2026 123456'), 'AT-2026-123456');
  assert.equal(normalizeReference('at2026123456'), 'AT-2026-123456');
  assert.equal(normalizeReference('invalid-random-string'), null);
});
