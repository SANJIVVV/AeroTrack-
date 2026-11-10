/*
 * Runtime settings for the browser app. Edit this file instead of rebuilding
 * anything: the client is served directly from the client directory.
 *
 * AEROTRACK_API_BASE: leave empty when a compatible API shares this origin.
 *   Set it to the API's URL when the client and API are hosted separately.
 * AEROTRACK_PUBLIC_URL: extra public site URL(s), comma separated, whose
 *   tracking links the "Paste QR Code Content" lookup should accept. The
 *   current site is always accepted.
 * AEROTRACK_DEMO_MODE: set true only to use local presentation accounts.
 */
window.AEROTRACK_API_BASE = '';
window.AEROTRACK_PUBLIC_URL = '';
window.AEROTRACK_DEMO_MODE = false;
