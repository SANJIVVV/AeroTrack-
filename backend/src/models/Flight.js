/**
 * FLIGHT MODEL
 * ------------
 * Mongoose schema for a scheduled airline flight.
 * Each document represents one flight leg (e.g. AI-202 DEL→BOM on a specific date).
 * Key fields:
 * - airlineCode / flightNumber: IATA identifiers (e.g. "AI", "AI202")
 * - origin / destination: ICAO airport codes (4 letters)
 * - scheduledDeparture / scheduledArrival: planned times (UTC)
 * - status: current flight state from FLIGHT_STATUSES (e.g. ON_TIME, DELAYED, LANDED)
 * - gate / baggageBelt: assigned terminal resources, if known
 * - source: how this flight was added (demo seed vs. staff entry)
 * - isDemo: flag for demo/sample flights that can be wiped without affecting real data
 * Unique index: (flightNumber, scheduledDeparture, isDemo) prevents duplicate entries.
 */
import { Schema, model } from 'mongoose';
import { FLIGHT_DATA_SOURCES, FLIGHT_STATUSES } from '@aerotrack/shared';

const flightSchema = new Schema(
  {
    airlineCode: { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
    airlineName: { type: String, required: true, trim: true, maxlength: 100 },
    flightNumber: { type: String, required: true, uppercase: true, trim: true, maxlength: 10 },
    origin: { type: String, required: true, uppercase: true, trim: true, maxlength: 4 },
    destination: { type: String, required: true, uppercase: true, trim: true, maxlength: 4 },
    scheduledDeparture: { type: Date, required: true },
    scheduledArrival: { type: Date, required: true },
    status: { type: String, enum: FLIGHT_STATUSES, default: 'UNKNOWN' },
    // Gate and reclaim belt: sample values on demo flights, or entered by staff.
    gate: { type: String, trim: true, uppercase: true, maxlength: 6, default: null },
    baggageBelt: { type: String, trim: true, uppercase: true, maxlength: 4, default: null },
    featured: { type: Boolean, default: false },
    source: { type: String, enum: FLIGHT_DATA_SOURCES, required: true },
    lastRefreshedAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
flightSchema.index({ flightNumber: 1, scheduledDeparture: 1, isDemo: 1 }, { unique: true });
flightSchema.index({ scheduledDeparture: 1 });

export const Flight = model('Flight', flightSchema);
