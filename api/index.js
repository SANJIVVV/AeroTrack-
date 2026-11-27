/**
 * VERCEL SERVERLESS ADAPTER
 * -------------------------
 * Bridges incoming Vercel Serverless Function invocations to the
 * Express application created by backend/src/app.js.
 * Caches the initialized Express app instance and MongoDB connection across
 * warm Lambda container invocations to avoid reconnection overhead.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap } from '../backend/src/bootstrap.js';
import { createApp } from '../backend/src/app.js';
import { ensureDirectory } from '../backend/src/services/flights.js';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const ctx = await bootstrap();
      try {
        await ensureDirectory(ctx.now());
      } catch (e) {
        console.warn('Directory seed skipped or failed during cold start:', e.message);
      }
      const here = path.dirname(fileURLToPath(import.meta.url));
      return createApp(ctx, {
        clientDir: path.resolve(here, '../frontend'),
        sharedDir: path.resolve(here, '../shared-utils/src'),
        disableRateLimit: false,
      });
    })();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
