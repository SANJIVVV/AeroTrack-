/**
 * BAGGAGE MODEL
 * -------------
 * Mongoose schema for a piece of passenger baggage tracked through the airport.
 * Each document follows one bag from check-in to baggage claim.
 * Key fields:
 * - reference: unique human-readable bag tag (e.g. "AT-XXXXXX"), used for QR scanning
 * - owner: the passenger (User) who registered this bag
 * - flight: the Flight this bag is checked in for (nullable if not yet assigned)
 * - status: current bag state from BAGGAGE_STATUSES (e.g. CHECKED_IN, IN_TRANSIT, DELIVERED)
 * - lastMainStatus: last status in the main processing flow (from MAIN_FLOW)
 * - lastScanAt / lastCheckpoint: most recent scan location and time
 * - skippedCheckpoints: count of checkpoints the bag missed (triggers anomaly alerts)
 * - version: optimistic concurrency counter to prevent lost-update conflicts
 * - isDemo: flag for demo bags that can be cleared without affecting real passengers
 */
import { Schema, model } from 'mongoose';
import { BAGGAGE_STATUSES, MAIN_FLOW } from '@aerotrack/shared';

const baggageSchema = new Schema(
  {
    reference: { type: String, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    flight: { type: Schema.Types.ObjectId, ref: 'Flight', default: null, index: true },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    color: { type: String, trim: true, maxlength: 40, default: '' },
    weightKg: { type: Number, min: 0, max: 100, default: null },
    status: { type: String, enum: BAGGAGE_STATUSES, default: 'REGISTERED', index: true },
    lastMainStatus: { type: String, enum: MAIN_FLOW, default: 'REGISTERED' },
    lastScanAt: { type: Date, default: null },
    lastCheckpoint: { type: Schema.Types.ObjectId, ref: 'Checkpoint', default: null },
    skippedCheckpoints: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
baggageSchema.index({ reference: 1 }, { unique: true });
baggageSchema.index({ status: 1, lastScanAt: 1 });

export const Baggage = model('Baggage', baggageSchema);
