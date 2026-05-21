import { ConflictException } from '@nestjs/common';

export const BOT_AUTOPILOT_ACTIVE_CODE = 'BOT_AUTOPILOT_ACTIVE';

/**
 * Thrown by `InboxOperatorMessageService` when a client attempts to send
 * an operator reply on a conversation whose `controlMode` is not
 * `'human'`. The endpoint deliberately does NOT auto-flip control mode
 * (FE must call `PATCH /inbox/conversations/:id/control-mode` first), so
 * this is a 409 with the stable, single-source error code
 * `BOT_AUTOPILOT_ACTIVE`.
 *
 * The error code is embedded in the response body via `getResponse()` so
 * the FE can branch on it without parsing the message string. This is the
 * ONLY 409 code emitted by the operator-send path.
 */
export class BotAutopilotActiveException extends ConflictException {
  constructor(
    message = 'Conversation is in bot autopilot; switch to human mode first.',
  ) {
    super({
      statusCode: 409,
      code: BOT_AUTOPILOT_ACTIVE_CODE,
      message,
    });
  }
}
