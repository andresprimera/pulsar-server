import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { decodeCursor, encodeCursor } from './cursor.util';

describe('cursor.util', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('round-trips a cursor', () => {
      const cursor = {
        t: new Date('2026-05-19T10:00:00.000Z'),
        i: new Types.ObjectId('64b8b1c5e4b0c2a3f4d5e6f7'),
      };
      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);
      if (decoded === null) {
        throw new Error('decodeCursor returned null for a valid round-trip');
      }
      expect(decoded.t.toISOString()).toBe(cursor.t.toISOString());
      expect(decoded.i.toHexString()).toBe(cursor.i.toHexString());
    });
  });

  describe('decodeCursor', () => {
    it('returns null for undefined / null / empty', () => {
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor('')).toBeNull();
    });

    it('throws BadRequestException on malformed base64 → not valid JSON', () => {
      // 'not-base64-json' decodes to some bytes, but not valid JSON
      const malformed = Buffer.from('not json', 'utf8').toString('base64url');
      expect(() => decodeCursor(malformed)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when payload is missing fields', () => {
      const incomplete = Buffer.from(
        JSON.stringify({ t: 'x' }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeCursor(incomplete)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when ISO date is invalid', () => {
      const bad = Buffer.from(
        JSON.stringify({ t: 'not-a-date', i: '64b8b1c5e4b0c2a3f4d5e6f7' }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeCursor(bad)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when ObjectId is invalid', () => {
      const bad = Buffer.from(
        JSON.stringify({ t: '2026-05-19T10:00:00.000Z', i: 'not-an-objectid' }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeCursor(bad)).toThrow(BadRequestException);
    });
  });
});
