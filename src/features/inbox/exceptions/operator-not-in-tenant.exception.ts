import { UnprocessableEntityException } from '@nestjs/common';

export const OPERATOR_NOT_IN_TENANT_CODE = 'OPERATOR_NOT_IN_TENANT';

/**
 * Thrown by `InboxConversationMutationService.changeAssignment` when the
 * target `operatorClientUserId` is missing, belongs to a different
 * tenant, or is not in `'active'` status. Surface as 422 rather than 404
 * so the FE can distinguish "the conversation doesn't exist for you"
 * (404 on the path param) from "the user you tried to assign isn't a
 * valid teammate" (422 on the body).
 */
export class OperatorNotInTenantException extends UnprocessableEntityException {
  constructor(
    message = 'Target operator is not a valid member of this tenant.',
  ) {
    super({
      statusCode: 422,
      code: OPERATOR_NOT_IN_TENANT_CODE,
      message,
    });
  }
}
