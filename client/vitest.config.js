import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Keep the browser's /shared/... imports working in Vitest and Vite.
  resolve: { alias: [{ find: /^\/shared\/(.*)$/, replacement: here('shared/$1') }] },
  test: {
    root: here('.'),
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
