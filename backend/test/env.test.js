import test from 'node:test';
import assert from 'node:assert/strict';
import { redactMongoUri, corsOrigins, loadEnv, EnvError } from '../src/config/env.js';

test('redactMongoUri: hides username and password', () => {
  const uri = 'mongodb+srv://admin_user:secret_pass_123@cluster0.mongodb.net/aerotrack_pro?retryWrites=true';
  const redacted = redactMongoUri(uri);
  assert.ok(!redacted.includes('secret_pass_123'), 'Password was exposed in redacted URI');
  assert.ok(!redacted.includes('admin_user'), 'Username was exposed in redacted URI');
  assert.equal(redacted, 'mongodb+srv://***:***@cluster0.mongodb.net/aerotrack_pro');

  const localUri = 'mongodb://localhost:27017/aerotrack_test';
  assert.equal(redactMongoUri(localUri), 'mongodb://localhost:27017/aerotrack_test');
});

test('corsOrigins: parses allowed client URLs', () => {
  const env = {
    CLIENT_URL: 'http://localhost:4000',
    CORS_ORIGINS: 'https://aerotrack.example.com, https://preview.example.com',
  };
  const origins = corsOrigins(env);
  assert.deepEqual(origins, [
    'http://localhost:4000',
    'https://aerotrack.example.com',
    'https://preview.example.com',
  ]);
});

test('loadEnv: validates environment and fails on missing required variables', () => {
  // Missing MONGODB_URI & SESSION_SECRET
  assert.throws(() => loadEnv({}), EnvError);

  // Valid minimum environment
  const valid = loadEnv({
    MONGODB_URI: 'mongodb://localhost:27017/test_db',
    SESSION_SECRET: '0123456789012345678901234567890123456789',
  });
  assert.equal(valid.PORT, 4000);
  assert.equal(valid.MONGODB_DB_NAME, 'aerotrack_pro');
  assert.equal(valid.NODE_ENV, 'development');
});
