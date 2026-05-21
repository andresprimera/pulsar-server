import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ClientAuth } from '@shared/decorators/client-auth.decorator';
import { ClientRoles } from '@shared/decorators/client-roles.decorator';
import { CurrentClientUser } from '@shared/decorators/current-client-user.decorator';
import { ClientUserPrincipal } from '@shared/types/express';
import { InboxService } from './inbox.service';
import { InboxOperatorMessageService } from './inbox-operator-message.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListConversationsResponseDto } from './dto/list-conversations-response.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListMessagesResponseDto } from './dto/list-messages-response.dto';
import { UpdateControlModeDto } from './dto/update-control-mode.dto';
import { UpdateControlModeResponseDto } from './dto/update-control-mode-response.dto';
import { SendInboxMessageDto } from './dto/send-inbox-message.dto';
import { InboxMessageDto } from './dto/inbox-message.dto';

/**
 * UUID v4 canonical form. The 13th nibble is `4`; the 17th nibble is one
 * of `8`, `9`, `a`, `b` (case-insensitive). Length is 36 characters
 * inclusive of hyphens; total ≤ 64 chars (Phase-2 ceiling).
 */
const UUID_V4_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const IDEMPOTENCY_KEY_MAX_LENGTH = 64;

/**
 * Client-tier Inbox controller.
 *
 * Tenant identity is read exclusively from `request.clientUser.clientId` via
 * `@CurrentClientUser()` — there is no `@Param`, `@Query`, or `@Body`
 * accepting `clientId`, so a smuggled value cannot reach the service. For
 * the same reason `@OwnsClient(...)` is intentionally absent: that decorator
 * applies only to routes whose composed path contains `:clientId`
 * (see `test/architecture/clientid-routes-have-owns-client.spec.ts`).
 *
 * `:conversationId` path params are validated as Mongo ObjectId strings
 * inline to fail fast with a 400; cross-tenant lookups return 404 (not 403)
 * to avoid leaking existence.
 */
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly inboxService: InboxService,
    private readonly inboxOperatorMessageService: InboxOperatorMessageService,
  ) {}

  @ClientAuth()
  @ClientRoles('owner', 'operator')
  @Get('conversations')
  async listConversations(
    @CurrentClientUser() principal: ClientUserPrincipal | undefined,
    @Query() query: ListConversationsQueryDto,
  ): Promise<ListConversationsResponseDto> {
    const clientId = requireClientId(principal);
    return this.inboxService.listConversations(clientId, query);
  }

  @ClientAuth()
  @ClientRoles('owner', 'operator')
  @Get('conversations/:conversationId/messages')
  async listMessages(
    @CurrentClientUser() principal: ClientUserPrincipal | undefined,
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<ListMessagesResponseDto> {
    const clientId = requireClientId(principal);
    requireValidObjectId(conversationId);
    return this.inboxService.listConversationMessages(
      clientId,
      conversationId,
      query,
    );
  }

  @ClientAuth()
  @ClientRoles('owner', 'operator')
  @Patch('conversations/:conversationId/control-mode')
  async updateControlMode(
    @CurrentClientUser() principal: ClientUserPrincipal | undefined,
    @Param('conversationId') conversationId: string,
    @Body() body: UpdateControlModeDto,
  ): Promise<UpdateControlModeResponseDto> {
    const authenticated = requireAuthenticated(principal);
    requireValidObjectId(conversationId);
    return this.inboxService.updateControlMode(
      authenticated.clientId,
      conversationId,
      body.controlMode,
      authenticated.userId,
    );
  }

  /**
   * Operator-driven outbound reply.
   *
   * - `Idempotency-Key: <uuid-v4>` header is REQUIRED. Replay safety is
   *   provided by the partial-unique compound index on `Message`
   *   `(conversationId, idempotencyKey)` — see the service for the
   *   5-step monotone flow.
   * - 409 `BOT_AUTOPILOT_ACTIVE` when the conversation is not in human
   *   mode. The endpoint never auto-flips control mode.
   * - 404 when the conversation is not owned by the caller's client.
   * - 502 when the downstream channel adapter throws; the persisted row
   *   remains with `deliveryStatus: 'failed'` so the thread shows the
   *   attempt.
   */
  @ClientAuth()
  @ClientRoles('owner', 'operator')
  @Post('conversations/:conversationId/messages')
  @HttpCode(201)
  async sendMessage(
    @CurrentClientUser() principal: ClientUserPrincipal | undefined,
    @Param('conversationId') conversationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SendInboxMessageDto,
  ): Promise<InboxMessageDto> {
    const authenticated = requireAuthenticated(principal);
    requireValidObjectId(conversationId);
    const key = requireValidIdempotencyKey(idempotencyKey);

    return this.inboxOperatorMessageService.sendOperatorMessage({
      clientId: authenticated.clientId,
      conversationId,
      authorClientUserId: authenticated.userId,
      text: body.text,
      idempotencyKey: key,
    });
  }
}

function requireAuthenticated(
  principal: ClientUserPrincipal | undefined,
): ClientUserPrincipal {
  if (principal === undefined || principal.clientId.length === 0) {
    throw new UnauthorizedException('Authentication required');
  }
  return principal;
}

function requireClientId(principal: ClientUserPrincipal | undefined): string {
  return requireAuthenticated(principal).clientId;
}

function requireValidObjectId(value: string): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new BadRequestException('Invalid conversationId');
  }
}

function requireValidIdempotencyKey(value: string | undefined): string {
  if (value === undefined || value === null || value.length === 0) {
    throw new BadRequestException(
      'Idempotency-Key header is required (UUID v4)',
    );
  }
  if (value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new BadRequestException(
      `Idempotency-Key header must be ≤ ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
    );
  }
  if (!UUID_V4_REGEX.test(value)) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return value;
}
