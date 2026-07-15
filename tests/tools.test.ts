import { describe, expect, it } from 'vitest';

import {
  baggagePolicyText,
  changeSeatText,
  lookupBookingText,
} from '../src/agent.js';

// These guard the crash the RELAI simulator hit: under the Agents SDK's
// strict-schema handling a model can send `null` (or omit a field) for a
// tool argument, so `execute` may receive a non-string. The tools must
// return a graceful response instead of throwing on `undefined.trim()`.
describe('lookupBookingText', () => {
  it('does not throw and asks for a code when none is given', () => {
    for (const value of [undefined, null, '', '   ']) {
      expect(() => lookupBookingText(value)).not.toThrow();
      expect(lookupBookingText(value)).toMatch(/confirmation code/i);
    }
  });

  it('reports unknown codes', () => {
    expect(lookupBookingText('ZZZ999')).toMatch(/no booking was found/i);
  });

  it('looks up a known booking (case-insensitive, trimmed)', () => {
    const result = lookupBookingText(' sky123 ');
    expect(result).toContain('Maya Chen');
    expect(result).toContain('JFK to SFO');
  });
});

describe('baggagePolicyText', () => {
  it('defaults to standard for missing/blank input', () => {
    for (const value of [undefined, null, '']) {
      expect(() => baggagePolicyText(value)).not.toThrow();
      expect(baggagePolicyText(value)).toMatch(/standard tickets/i);
    }
  });

  it('returns policy per ticket type', () => {
    expect(baggagePolicyText('basic')).toMatch(/basic economy/i);
    expect(baggagePolicyText('BUSINESS')).toMatch(/premium cabins/i);
  });
});

describe('changeSeatText', () => {
  it('does not throw on missing arguments', () => {
    expect(() => changeSeatText(undefined, undefined)).not.toThrow();
    expect(changeSeatText(undefined, undefined)).toMatch(
      /valid confirmation code/i,
    );
  });

  it('requires a valid confirmation code', () => {
    expect(changeSeatText('ZZZ999', '14C')).toMatch(
      /valid confirmation code/i,
    );
  });

  it('asks for a seat when the code is valid but no seat is given', () => {
    expect(changeSeatText('SKY123', null)).toMatch(/which seat/i);
  });

  it('updates the seat for a valid booking', () => {
    expect(changeSeatText(' bay777 ', ' 20f ')).toBe(
      'Seat updated to 20F for booking BAY777.',
    );
  });
});
