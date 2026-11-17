import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/coverage/**', 'ml-model/**', 'frontend/libraries/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['frontend/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['frontend/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['frontend/js/theme-init.js', 'frontend/js/config.js'],
    languageOptions: { sourceType: 'script' },
  },
];
