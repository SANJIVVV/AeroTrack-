/**
 * QR payloads carry only a non-sensitive baggage reference.
 * Passenger names, flight details and contact data are never encoded;
 * a signed-in, authorised user is needed for the backend to resolve it.
 */

export const QR_PREFIX = 'AEROTRACK:BAG:';

/** Current tag format: AT-<year>-<6 random digits>, e.g. AT-2026-100245. */
const YEAR_REFERENCE = /^AT-\d{4}-\d{6}$/;
// Earlier format (still accepted): Crockford-style alphabet without I, L, O, U.
const LEGACY_REFERENCE = /^AT-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const LEGACY_ALPHABET = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export const REFERENCE_PATTERN = new RegExp(`${YEAR_REFERENCE.source}|${LEGACY_REFERENCE.source}`);

export function isReference(text) {
  return YEAR_REFERENCE.test(text) || LEGACY_REFERENCE.test(text);
}

/**
 * Cryptographically secure random integer generation in [min, max] (inclusive)
 * using rejection sampling to eliminate modulo bias.
 *
 * Algorithm:
 * 1. Calculate range size S = (max - min + 1).
 * 2. Find the largest multiple of S <= 2^32: limit = 2^32 - (2^32 % S).
 * 3. Draw a 32-bit unsigned integer n from the cryptographic source.
 * 4. Reject n if n >= limit (re-sample).
 * 5. Return min + (n % S).
 *
 * Guarantees exact uniform probability distribution without modulo bias.
 */
export function secureRandomInt(min, max, randomSource) {
  if (min > max) throw new RangeError('min must be <= max');
  const range = max - min + 1;
  if (range <= 1) return min;

  const maxUint32 = 0x1_00_00_00_00; // 2^32 = 4,294,967,296
  const limit = maxUint32 - (maxUint32 % range);

  const nextUint32 = () => {
    if (typeof randomSource === 'function') {
      const b = randomSource(4);
      return (((b[0] ?? 0) << 24) | ((b[1] ?? 0) << 16) | ((b[2] ?? 0) << 8) | (b[3] ?? 0)) >>> 0;
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      globalThis.crypto.getRandomValues(buf);
      return buf[0] >>> 0;
    }
    return Math.floor(Math.random() * maxUint32) >>> 0;
  };

  let n;
  do {
    n = nextUint32();
  } while (n >= limit);

  return min + (n % range);
}

/**
 * Generate a uniform random 6-digit identifier string [000000..999999] using CSPRNG.
 */
export function generateRandomDigits(digits = 6, randomSource) {
  const max = 10 ** digits - 1;
  const val = secureRandomInt(0, max, randomSource);
  return String(val).padStart(digits, '0');
}

/**
 * New tag reference: AT-<year>-<6 random digits>
 * Uses CSPRNG algorithm with unbiased rejection sampling.
 *
 * Backward compatible:
 * - Accepts `randomBytes` function `(n) => Buffer/Uint8Array`
 * - Accepts `year` as second argument or as first argument if `randomBytes` omitted
 * - Defaults to `globalThis.crypto.getRandomValues` when `randomBytes` is omitted
 */
export function generateReference(randomBytes, year) {
  let yr = year;
  let src = randomBytes;
  if (typeof randomBytes === 'number' && year === undefined) {
    yr = randomBytes;
    src = undefined;
  }
  const resolvedYear = yr ?? new Date().getUTCFullYear();
  const digits = generateRandomDigits(6, src);
  return `AT-${resolvedYear}-${digits}`;
}

export function toQrPayload(reference) {
  return `${QR_PREFIX}${reference}`;
}

/**
 * Generate a complete QR payload for a new baggage tag.
 * Returns { reference, payload } where payload is formatted for QR encoding.
 */
export function generateQrPayload(randomSource, year) {
  const reference = generateReference(randomSource, year);
  return {
    reference,
    payload: toQrPayload(reference),
  };
}

/** Normalise manual entry: trims, upper-cases, tolerates missing dashes and spaces. */
export function normalizeReference(input) {
  const raw = input.trim().toUpperCase().replace(/\s+/g, '');
  const year = /^AT-?(\d{4})-?(\d{6})$/.exec(raw);
  if (year) return `AT-${year[1]}-${year[2]}`;
  const compact = raw.startsWith('AT') ? raw.slice(2).replace(/-/g, '') : raw.replace(/-/g, '');
  if (!LEGACY_ALPHABET.test(compact)) return null;
  const ref = `AT-${compact.slice(0, 4)}-${compact.slice(4)}`;
  return LEGACY_REFERENCE.test(ref) ? ref : null;
}

/** Parse a scanned QR string. Returns null for anything that is not ours. */
export function parseQrPayload(payload) {
  const text = payload.trim();
  if (!text.startsWith(QR_PREFIX)) return null;
  const ref = text.slice(QR_PREFIX.length);
  return isReference(ref) ? ref : null;
}

/**
 * Turn anything a user might paste (a decoded QR payload, a plain baggage ID,
 * or a tracking link) into a reference. Links are accepted only when their
 * origin is one of `trustedOrigins`; nothing is ever opened or fetched.
 */
export function parseLookupInput(input, trustedOrigins) {
  const text = input.trim();
  if (!text) return { ok: false, reason: 'EMPTY' };
  const fromQr = parseQrPayload(text);
  if (fromQr) return { ok: true, reference: fromQr, via: 'qr-payload' };
  if (/^https?:\/\//i.test(text)) {
    let url;
    try {
      url = new URL(text);
    } catch {
      return { ok: false, reason: 'INVALID' };
    }
    const trusted = trustedOrigins.some((o) => {
      try {
        return new URL(o).origin === url.origin;
      } catch {
        return false;
      }
    });
    if (!trusted) return { ok: false, reason: 'UNTRUSTED_URL' };
    const m = /^\/(?:track|baggage)\/([^/?#]+)\/?$/.exec(url.pathname);
    const ref = m ? normalizeReference(decodeURIComponent(m[1])) : null;
    return ref ? { ok: true, reference: ref, via: 'url' } : { ok: false, reason: 'INVALID' };
  }
  const ref = normalizeReference(text);
  return ref ? { ok: true, reference: ref, via: 'reference' } : { ok: false, reason: 'INVALID' };
}
