import { ForbiddenException } from '@nestjs/common';

export const INSUFFICIENT_PRIVILEGE_CODE = 'INSUFFICIENT_PRIVILEGE';

/**
 * Thrown by `InboxConversationMutationService.changeAssignment` when an
 * `operator`-role caller attempts an assignment they are not allowed to
 * perform (assigning another operator, or unassigning a conversation
 * currently owned by another operator). Owners are never gated.
 *
 * The stable code `INSUFFICIENT_PRIVILEGE` is embedded in the response
 * body via `getResponse()` so the FE can branch on it without parsing
 * the message string. This is the ONLY 403 code emitted by the
 * Phase-3 mutation surface.
 */
export class InsufficientPrivilegeException extends ForbiddenException {
  constructor(message = 'Insufficient privilege to perform this assignment.') {
    super({
      statusCode: 403,
      code: INSUFFICIENT_PRIVILEGE_CODE,
      message,
    });
  }
}
