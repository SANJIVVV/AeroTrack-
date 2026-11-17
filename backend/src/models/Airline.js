/**
 * AIRLINE MODEL
 * -------------
 * Mongoose schema for an airline entry in the AeroTrack demonstration directory.
 * This is a curated sample list (seeded from shared-utils/src/airlines.js) used to
 * populate realistic demo flights — it does not represent real commercial partnerships.
 * Key fields:
 * - code: 2–3 character IATA airline code (e.g. "AI" for Air India), unique
 * - name / country / region: human-readable identifiers for display
 * - hub: ICAO code of the airline's primary hub airport (4 letters)
 * - description: short marketing blurb shown on the Airlines directory page
 * - officialSite: URL to the real airline's website
 * - image: filename of the airline's hero image asset
 * - photoMatchesAirline: whether the image actually depicts this airline's aircraft
 * - featuredFlightNumber: an example flight number shown prominently in the UI
 * - active: soft-disable an airline without removing it from the database
 * - isDemoDirectory: always true; marks these as seed data, not live flight data
 */
import { Schema, model } from 'mongoose';
import { AIRLINE_REGIONS } from '@aerotrack/shared';

// Demonstration airline directory (seeded from shared/src/airlines.ts). Not a partnership claim.
const airlineSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
    region: { type: String, enum: AIRLINE_REGIONS, required: true },
    hub: { type: String, required: true, uppercase: true, maxlength: 4 },
    description: { type: String, required: true, maxlength: 500 },
    officialSite: { type: String, required: true, maxlength: 200 },
    image: { type: String, required: true, maxlength: 60 },
    photoMatchesAirline: { type: Boolean, default: false },
    featuredFlightNumber: { type: String, maxlength: 10, default: null },
    active: { type: Boolean, default: true },
    isDemoDirectory: { type: Boolean, default: true },
  },
  { timestamps: true },
);
airlineSchema.index({ code: 1 }, { unique: true });
airlineSchema.index({ region: 1 });

export const Airline = model('Airline', airlineSchema);
