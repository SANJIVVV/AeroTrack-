import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFeatures,
  baselineRisk,
  isLogisticModel,
  logisticRisk,
} from '../src/prediction.js';

test('buildFeatures: correctly extracts feature vectors', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const lastScanAt = new Date('2026-11-20T11:00:00Z'); // 60 minutes ago
  const scheduledDeparture = new Date('2026-11-20T12:30:00Z'); // 30 minutes from now

  const features = buildFeatures({
    lastMainStatus: 'SECURITY_SCREENING',
    lastScanAt,
    skippedCheckpoints: 1,
    openAnomalies: 2,
    flightStatus: 'DELAYED',
    scheduledDeparture,
    now,
  });

  assert.equal(features.stageIndex, 2);
  assert.equal(features.minutesSinceLastScan, 60);
  assert.equal(features.skippedCheckpoints, 1);
  assert.equal(features.openAnomalies, 2);
  assert.equal(features.flightDelayed, 1);
  assert.equal(features.flightCancelled, 0);
  assert.equal(features.minutesToDeparture, 30);
  assert.equal(features.notLoadedNearDeparture, 1); // stage < LOADED and toDeparture < 45m
});

test('baselineRisk: computes bounded, explainable risk score', () => {
  const features = {
    stageIndex: 2,
    minutesSinceLastScan: 60,
    dwellRatio: 1.5,
    skippedCheckpoints: 1,
    openAnomalies: 1,
    flightDelayed: 1,
    flightCancelled: 0,
    minutesToDeparture: 30,
    notLoadedNearDeparture: 1,
  };

  const est = baselineRisk(features);
  assert.equal(est.method, 'rules-baseline');
  assert.ok(est.risk >= 0 && est.risk <= 1, `Risk ${est.risk} not in [0, 1]`);
  assert.ok(['low', 'medium', 'high'].includes(est.level));
  assert.ok(Array.isArray(est.factors));
  assert.ok(est.factors.length > 0);
  assert.ok(est.disclaimer.includes('Rules-based baseline'));
});

test('isLogisticModel and logisticRisk evaluation', () => {
  assert.equal(isLogisticModel(null), false);
  assert.equal(isLogisticModel({}), false);

  const mockModel = {
    version: '1.0.0',
    dataOrigin: 'synthetic',
    features: ['flightDelayed', 'flightCancelled'],
    coef: [0.8, 1.2],
    mean: [0.1, 0.02],
    scale: [0.3, 0.14],
    intercept: -1.5,
  };

  assert.equal(isLogisticModel(mockModel), true);

  const features = {
    flightDelayed: 1,
    flightCancelled: 0,
  };

  const pred = logisticRisk(features, mockModel);
  assert.equal(pred.method, 'logistic-regression');
  assert.ok(pred.risk >= 0 && pred.risk <= 1);
  assert.ok(pred.factors.length > 0);
});
