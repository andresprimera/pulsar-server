import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Opaque cursor used by the inbox list and message-thread endpoints.
 *
 * Encodes a `(timestamp, ObjectId)` pair as URL-safe base64 of a JSON
 * payload `{ t, i }`. The pair is used to break ties at same-millisecond
 * boundaries and to enforce stable pagination under concurrent writes.
 *
 * Decoder is strict — any malformed input (bad base64, non-JSON, missing
 * fields, invalid ISO date, invalid ObjectId) raises BadRequestException.
 */

export interface PageCursor {
  t: Date;
  i: Types.ObjectId;
}

interface EncodedShape {
  t: string;
  i: string;
}

export function encodeCursor(cursor: PageCursor): string {
  const payload: EncodedShape = {
    t: cursor.t.toISOString(),
    i: cursor.i.toHexString(),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(
  raw: string | undefined | null,
): PageCursor | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  let json: string;
  try {
    json = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as EncodedShape).t !== 'string' ||
    typeof (parsed as EncodedShape).i !== 'string'
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  const encoded = parsed as EncodedShape;
  const date = new Date(encoded.t);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid cursor');
  }
  if (!Types.ObjectId.isValid(encoded.i)) {
    throw new BadRequestException('Invalid cursor');
  }

  return { t: date, i: new Types.ObjectId(encoded.i) };
}
