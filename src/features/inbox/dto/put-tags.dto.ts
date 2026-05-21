import {
  ArrayMaxSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Body shape for `PUT /inbox/conversations/:conversationId/tags`.
 *
 * `PUT` (full replace) per plan Decision 5 — the FE holds the canonical
 * list. Per-element rules:
 *  - non-empty (`MinLength(1)`),
 *  - at most 32 chars (`MaxLength(32)`),
 *  - characters limited to `[a-zA-Z0-9._-]` (case is normalized to
 *    lowercase in the service).
 *
 * Outer rules:
 *  - at most 16 entries (`ArrayMaxSize(16)`).
 *
 * The service performs `trim().toLowerCase()` + dedupe before
 * persisting. The service also defensively re-checks the post-dedupe
 * count (defense-in-depth against array-explosion which is normally
 * impossible — `Set(...)` only shrinks).
 */
export class PutTagsDto {
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(32, { each: true })
  @Matches(/^[a-zA-Z0-9._-]+$/, { each: true })
  tags!: string[];
}
