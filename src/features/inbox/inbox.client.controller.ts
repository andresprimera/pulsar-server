import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ClientAuth } from '@shared/decorators/client-auth.decorator';
import { ClientRoles } from '@shared/decorators/client-roles.decorator';
import { CurrentClientUser } from '@shared/decorators/current-client-user.decorator';
import { ClientUserPrincipal } from '@shared/types/express';
import { InboxService } from './inbox.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListConversationsResponseDto } from './dto/list-conversations-response.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListMessagesResponseDto } from './dto/list-messages-response.dto';
import { UpdateControlModeDto } from './dto/update-control-mode.dto';
import { UpdateControlModeResponseDto } from './dto/update-control-mode-response.dto';

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
  constructor(private readonly inboxService: InboxService) {}

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
