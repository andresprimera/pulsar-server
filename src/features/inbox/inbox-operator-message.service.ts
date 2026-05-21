import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { ContactRepository } from '@persistence/repositories/contact.repository';
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import {
  MessageIdempotencyConflictError,
  MessageRepository,
} from '@persistence/repositories/message.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import { Message } from '@persistence/schemas/message.schema';
import { MessagingGatewayService } from '@channels/gateway/messaging-gateway.service';
import { ConversationService } from '@domain/conversation/conversation.service';
import { BotAutopilotActiveException } from './exceptions/bot-autopilot-active.exception';
import { InboxMessageDto } from './dto/inbox-message.dto';
import { toInboxMessageDto } from './utils/inbox-message.mapper';

/**
 * Input shape for the operator-send orchestration. ObjectId strings are
 * validated at the controller boundary, but this service also defensively
 * rejects malformed values (the controller is the single HTTP-facing
 * caller today, but the contract is explicit).
 */
export interface SendOperatorMessageInput {
  clientId: string;
  conversationId: string;
  authorClientUserId: string;
  text: string;
  idempotencyKey: string;
}

/**
 * Feature-layer orchestration of the tenant-driven operator outbound
 * reply flow. Owns the 5-step monotone algorithm:
 *
 *   1. Resolve channel + recipient (Channel, ClientAgent hire-channel
 *      entry, Contact).
 *   2. Insert the `type: 'human'` Message with
 *      `deliveryStatus: 'pending'` (E11000 → replay re-read).
 *   3. Dispatch via `MessagingGatewayService` (channel adapter; decrypts
 *      inside the adapter, never here).
 *   4. Update `deliveryStatus` to `'sent'` or `'failed'`.
 *   5. Touch the conversation via `ConversationService.touch` (the
 *      single seam for inbox-list write columns) on BOTH success and
 *      failure.
 *
 * On dispatch failure the persisted row remains with
 * `deliveryStatus: 'failed'` so operators can see the attempt; the
 * service then throws `BadGatewayException` (HTTP 502).
 */
@Injectable()
export class InboxOperatorMessageService {
  private readonly logger = new Logger(InboxOperatorMessageService.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly userRepository: UserRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly contactRepository: ContactRepository,
    private readonly messagingGatewayService: MessagingGatewayService,
    private readonly conversationService: ConversationService,
  ) {}

  async sendOperatorMessage(
    input: SendOperatorMessageInput,
  ): Promise<InboxMessageDto> {
    // P1. Validate ObjectIds defensively (controller already validates
    // conversationId; clientId/authorClientUserId come from the
    // authenticated principal but we still guard against drift).
    if (
      !Types.ObjectId.isValid(input.conversationId) ||
      !Types.ObjectId.isValid(input.clientId) ||
      !Types.ObjectId.isValid(input.authorClientUserId)
    ) {
      throw new BadRequestException('Invalid ObjectId in operator-send input');
    }
    const conversationObjectId = new Types.ObjectId(input.conversationId);
    const clientObjectId = new Types.ObjectId(input.clientId);
    const authorObjectId = new Types.ObjectId(input.authorClientUserId);

    // P2. Ownership check. `findByIdForClient` returns null for both
    // not-found and cross-tenant — controller maps to 404 to avoid leaks.
    const conversation = await this.conversationRepository.findByIdForClient(
      conversationObjectId,
      clientObjectId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    this.logger.log(
      `event=inbox.operator.send.started conversationId=${String(
        conversation._id,
      )} authorClientUserId=${input.authorClientUserId} idempotencyKey=${
        input.idempotencyKey
      }`,
    );

    // P3. Control-mode gate — only legal while the operator owns the
    // conversation. The endpoint never auto-flips; FE flips first.
    if (conversation.controlMode !== 'human') {
      throw new BotAutopilotActiveException();
    }

    // P4. Cheap-path replay short-circuit. No dispatch, no touch.
    const prior = await this.messageRepository.findByIdempotencyKey(
      conversationObjectId,
      input.idempotencyKey,
    );
    if (prior) {
      this.logger.log(
        `event=inbox.operator.send.persisted conversationId=${String(
          conversation._id,
        )} messageId=${String(prior._id)} deliveryStatus=${
          prior.deliveryStatus ?? 'unknown'
        } idempotencyKey=${input.idempotencyKey} authorClientUserId=${
          input.authorClientUserId
        } replay=true`,
      );
      return this.toDtoWithAuthorName(prior);
    }

    // Core flow step 1: resolve channel + recipient.
    const channelObjectId = conversation.channelId as Types.ObjectId;
    const channel = await this.channelRepository.findById(
      String(channelObjectId),
    );
    if (!channel) {
      throw new BadRequestException('Conversation channel not found');
    }
    const channelType = channel.type;

    // The conversation carries the denormalized `clientAgentId` (the
    // hire `_id`). Resolve the hire directly and pick the channel-config
    // entry that owns this conversation's channel — that entry carries
    // the `provider` + encrypted `credentials` the gateway needs.
    if (!conversation.clientAgentId) {
      throw new BadRequestException(
        'Conversation has no resolvable hire (clientAgentId missing)',
      );
    }
    const hire = await this.clientAgentRepository.findById(
      String(conversation.clientAgentId),
    );
    if (!hire) {
      throw new BadRequestException(
        'Hire not found for conversation clientAgentId',
      );
    }
    const channelConfig = (hire.channels ?? []).find(
      (c) => c.channelId && String(c.channelId) === String(channelObjectId),
    );
    if (!channelConfig) {
      throw new BadRequestException(
        'Hire channel configuration not found for this conversation',
      );
    }

    const contact = await this.contactRepository.findById(
      String(conversation.contactId),
    );
    if (!contact) {
      throw new BadRequestException('Contact not found for conversation');
    }

    // Core flow step 2: insert the message with deliveryStatus: 'pending'.
    let persisted: Message;
    try {
      persisted = await this.messageRepository.createOperatorMessage({
        conversationId: conversationObjectId,
        clientId: clientObjectId,
        channelId: channelObjectId,
        authorClientUserId: authorObjectId,
        content: input.text,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      if (error instanceof MessageIdempotencyConflictError) {
        // Race-recovery: another request inserted with the same key
        // between our P4 read and our INSERT. Read it back and return.
        const recovered = await this.messageRepository.findByIdempotencyKey(
          conversationObjectId,
          input.idempotencyKey,
        );
        if (!recovered) {
          // Should be unreachable — the conflict means the row exists.
          throw error;
        }
        this.logger.log(
          `event=inbox.operator.send.persisted conversationId=${String(
            conversation._id,
          )} messageId=${String(recovered._id)} deliveryStatus=${
            recovered.deliveryStatus ?? 'unknown'
          } idempotencyKey=${input.idempotencyKey} authorClientUserId=${
            input.authorClientUserId
          } replay=true`,
        );
        return this.toDtoWithAuthorName(recovered);
      }
      throw error;
    }

    this.logger.log(
      `event=inbox.operator.send.persisted conversationId=${String(
        conversation._id,
      )} messageId=${String(
        persisted._id,
      )} deliveryStatus=pending idempotencyKey=${
        input.idempotencyKey
      } authorClientUserId=${
        input.authorClientUserId
      } channelType=${channelType}`,
    );

    // Core flow step 3: dispatch via gateway. The adapter decrypts inside.
    let dispatchError: unknown;
    try {
      await this.messagingGatewayService.send({
        channel: channelType,
        to: contact.externalId,
        message: input.text,
        provider: channelConfig.provider,
        credentials: channelConfig.credentials,
      });
    } catch (err) {
      dispatchError = err;
    }

    // Core flow step 4: update delivery status.
    const persistedId = persisted._id as Types.ObjectId;
    const terminal: 'sent' | 'failed' = dispatchError ? 'failed' : 'sent';
    const updated = await this.messageRepository.updateDeliveryStatus(
      persistedId,
      terminal,
    );
    // Non-mutating fallback: if `updated` is `null` (theoretically
    // unreachable — we just inserted the row), spread the lean
    // `persisted` plain object and overlay the terminal status so we
    // never mutate the original row in place.
    const finalRow: Message =
      updated ?? ({ ...persisted, deliveryStatus: terminal } as Message);

    if (dispatchError) {
      this.logger.warn(
        `event=inbox.operator.send.failed conversationId=${String(
          conversation._id,
        )} messageId=${String(
          persistedId,
        )} deliveryStatus=failed idempotencyKey=${
          input.idempotencyKey
        } authorClientUserId=${
          input.authorClientUserId
        } channelType=${channelType} error=${
          dispatchError instanceof Error
            ? dispatchError.message
            : String(dispatchError)
        }`,
      );
    } else {
      this.logger.log(
        `event=inbox.operator.send.sent conversationId=${String(
          conversation._id,
        )} messageId=${String(
          persistedId,
        )} deliveryStatus=sent idempotencyKey=${
          input.idempotencyKey
        } authorClientUserId=${
          input.authorClientUserId
        } channelType=${channelType}`,
      );
    }

    // Core flow step 5: touch the conversation on BOTH success and
    // failure. The port adapter truncates the preview at 280 chars.
    await this.conversationService.touch(
      conversation._id as Types.ObjectId,
      new Date(),
      input.text,
    );

    // 502 on downstream dispatch failure; persisted row stays with
    // deliveryStatus: 'failed' so the thread reflects the attempt.
    if (dispatchError) {
      throw new BadGatewayException('Downstream channel delivery failed');
    }

    return this.toDtoWithAuthorName(finalRow);
  }

  /**
   * Loads a single `User.name` for a persisted row and returns the
   * mapped DTO. Used on the replay and final-return paths where only one
   * row is known.
   */
  private async toDtoWithAuthorName(
    message: Message,
  ): Promise<InboxMessageDto> {
    const map = new Map<string, string>();
    if (message.authorClientUserId) {
      const user = await this.userRepository.findById(
        String(message.authorClientUserId),
      );
      if (user) {
        map.set(String(user._id), user.name);
      }
    }
    return toInboxMessageDto(message, map);
  }
}
