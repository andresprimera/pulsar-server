import { IsMongoId, IsString, ValidateIf } from 'class-validator';

/**
 * Body shape for
 * `PATCH /inbox/conversations/:conversationId/assignment`.
 *
 * Two-layer defense per plan §6.3:
 *  - DTO validates the field is either literal `null` or a Mongo
 *    ObjectId string (`@IsMongoId()` only fires when non-null).
 *  - The service then re-checks that the target user exists, belongs to
 *    the caller's tenant, and is `'active'` — failures emit 422
 *    `OPERATOR_NOT_IN_TENANT`.
 *
 * Role gate: an operator may only target itself (`operatorClientUserId
 * === actorClientUserId`) or unassign a conversation already assigned
 * to itself. Owners may target any operator. Violations emit 403
 * `INSUFFICIENT_PRIVILEGE`.
 */
export class PatchAssignmentDto {
  @ValidateIf((o: PatchAssignmentDto) => o.operatorClientUserId !== null)
  @IsString()
  @IsMongoId()
  operatorClientUserId!: string | null;
}
