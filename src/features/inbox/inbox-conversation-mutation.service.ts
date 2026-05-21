import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationRepository } from '@persistence/repositories/conversation.repository';
import { ConversationReadRepository } from '@persistence/repositories/conversation-read.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import type { ClientRole } from '@shared/auth/client-roles';
import { ConversationSummaryDto } from './dto/conversation-summary.dto';
import { MarkReadResponseDto } from './dto/mark-read-response.dto';
import { InsufficientPrivilegeException } from './exceptions/insufficient-privilege.exception';
import { OperatorNotInTenantException } from './exceptions/operator-not-in-tenant.exception';
import { toConversationSummary } from './utils/conversation-summary.mapper';

/** Defensive upper-bound on the post-dedupe tag count. DTO already enforces
 *  ≤ 16 entries on the wire; this is a service-side double-check (dedupe can
 *  only shrink the list, but the assertion is cheap). */
const MAX_TAGS = 16;

export interface ChangeStatusInput {
  clientId: string;
  conversationId: string;
  status: 'open' | 'closed' | 'archived';
  actorClientUserId: string;
}

export interface ChangeAssignmentInput {
  clientId: string;
  conversationId: string;
  operatorClientUserId: string | null;
  actorClientUserId: string;
  actorClientRole: ClientRole;
}

export interface MarkReadInput {
  clientId: string;
  conversationId: string;
  actorClientUserId: string;
}

export interface ReplaceTagsInput {
  clientId: string;
  conversationId: string;
  tags: string[];
  actorClientUserId: string;
}

/**
 * Feature-layer orchestration of the five Phase-3 operator-driven inbox
 * mutations (`status`, `assignment`, `read`, `unread`, `tags`). Sibling to
 * `InboxOperatorMessageService`; deliberately decomposed from
 * `InboxService` to keep the read surface narrow (see plan §5.1).
 *
 * Each method follows the same monotone shape:
 *  1. Validate ObjectIds defensively (controller already validates the
 *     path param; this guards against future callers).
 *  2. Tenant ownership check via `ConversationRepository.findByIdForClient`
 *     → `null` maps to `NotFoundException` (no existence leak).
 *  3. Endpoint-specific validation (role gate, body shape, semantic check).
 *  4. Atomic write through the appropriate repository method.
 *  5. Terminal structured-log event in the Phase-2 `event=` format.
 *  6. Return the response DTO (status/assignment/tags re-read the
 *     enriched row so the wire shape matches the list endpoint;
 *     read/unread return the minimal `MarkReadResponseDto`).
 *
 * None of these flows invoke `ConversationService.touch` — they only
 * write discrete columns and never advance `lastMessageAt` /
 * `lastMessagePreview` (see plan §5.5).
 */
@Injectable()
export class InboxConversationMutationService {
  private readonly logger = new Logger(InboxConversationMutationService.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly conversationReadRepository: ConversationReadRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async changeStatus(
    input: ChangeStatusInput,
  ): Promise<ConversationSummaryDto> {
    this.requireValidObjectIds(
      input.clientId,
      input.conversationId,
      input.actorClientUserId,
    );

    const conversationObjectId = new Types.ObjectId(input.conversationId);
    const clientObjectId = new Types.ObjectId(input.clientId);
    const actorObjectId = new Types.ObjectId(input.actorClientUserId);

    const existing = await this.conversationRepository.findByIdForClient(
      conversationObjectId,
      clientObjectId,
    );
    if (!existing) {
      throw new NotFoundException('Conversation not found');
    }

    // P3. Idempotent short-circuit. Same status → no write, but still
    // return the enriched DTO (the FE expects the same wire shape on
    // every successful call).
    const fromStatus = existing.status;
    if (fromStatus === input.status) {
      return this.resolveSummary(
        conversationObjectId,
        clientObjectId,
        actorObjectId,
      );
    }

    const updated = await this.conversationRepository.updateStatusForClient(
      conversationObjectId,
      clientObjectId,
      input.status,
    );
    if (!updated) {
      // Race-safety: a parallel delete between P2 and P4 makes this
      // unreachable in practice, but the contract requires 404 not 500.
      throw new NotFoundException('Conversation not found');
    }

    this.logger.log(
      `event=inbox.status.changed conversationId=${String(
        updated._id,
      )} clientId=${input.clientId} actorClientUserId=${
        input.actorClientUserId
      } fromStatus=${fromStatus} toStatus=${input.status}`,
    );

    return this.resolveSummary(
      conversationObjectId,
      clientObjectId,
      actorObjectId,
    );
  }

  async changeAssignment(
    input: ChangeAssignmentInput,
  ): Promise<ConversationSummaryDto> {
    this.requireValidObjectIds(
      input.clientId,
      input.conversationId,
      input.actorClientUserId,
    );
    if (
      input.operatorClientUserId !== null &&
      !Types.ObjectId.isValid(input.operatorClientUserId)
    ) {
      throw new BadRequestException('Invalid operatorClientUserId');
    }

    const conversationObjectId = new Types.ObjectId(input.conversationId);
    const clientObjectId = new Types.ObjectId(input.clientId);
    const actorObjectId = new Types.ObjectId(input.actorClientUserId);

    const existing = await this.conversationRepository.findByIdForClient(
      conversationObjectId,
      clientObjectId,
    );
    if (!existing) {
      throw new NotFoundException('Conversation not found');
    }

    const fromAssignedOperatorId =
      existing.assignedOperatorId !== undefined &&
      existing.assignedOperatorId !== null
        ? String(existing.assignedOperatorId)
        : null;

    // P3. Role gate. Operators may only target themselves (assign-self
    // OR unassign-self). Owners are unrestricted.
    if (input.actorClientRole === 'operator') {
      if (input.operatorClientUserId === null) {
        // Operator can only clear an assignment when nobody owns the
        // conversation OR they are the current assignee.
        if (
          fromAssignedOperatorId !== null &&
          fromAssignedOperatorId !== input.actorClientUserId
        ) {
          throw new InsufficientPrivilegeException();
        }
      } else if (input.operatorClientUserId !== input.actorClientUserId) {
        throw new InsufficientPrivilegeException();
      }
    }

    // P4. Semantic check on the target user (only when assigning, not
    // when clearing).
    if (input.operatorClientUserId !== null) {
      const target = await this.userRepository.findById(
        input.operatorClientUserId,
      );
      if (
        !target ||
        String(target.clientId) !== input.clientId ||
        target.status !== 'active'
      ) {
        throw new OperatorNotInTenantException();
      }
    }

    // P5. Idempotent short-circuit. Same assignment → no write.
    const toAssignedOperatorId = input.operatorClientUserId;
    if (fromAssignedOperatorId === toAssignedOperatorId) {
      return this.resolveSummary(
        conversationObjectId,
        clientObjectId,
        actorObjectId,
      );
    }

    const updated = await this.conversationRepository.updateAssignmentForClient(
      conversationObjectId,
      clientObjectId,
      toAssignedOperatorId === null
        ? null
        : new Types.ObjectId(toAssignedOperatorId),
    );
    if (!updated) {
      throw new NotFoundException('Conversation not found');
    }

    this.logger.log(
      `event=inbox.assignment.changed conversationId=${String(
        updated._id,
      )} clientId=${input.clientId} actorClientUserId=${
        input.actorClientUserId
      } fromAssignedOperatorId=${
        fromAssignedOperatorId ?? 'null'
      } toAssignedOperatorId=${toAssignedOperatorId ?? 'null'}`,
    );

    return this.resolveSummary(
      conversationObjectId,
      clientObjectId,
      actorObjectId,
    );
  }

  async markRead(input: MarkReadInput): Promise<MarkReadResponseDto> {
    this.requireValidObjectIds(
      input.clientId,
      input.conversationId,
      input.actorClientUserId,
    );

    const conversationObjectId = new Types.ObjectId(input.conversationId);
    const clientObjectId = new Types.ObjectId(input.clientId);
    const actorObjectId = new Types.ObjectId(input.actorClientUserId);

    const existing = await this.conversationRepository.findByIdForClient(
      conversationObjectId,
      clientObjectId,
    );
    if (!existing) {
      throw new NotFoundException('Conversation not found');
    }

    const now = new Date();
    await this.conversationReadRepository.markRead({
      conversationId: conversationObjectId,
      operatorClientUserId: actorObjectId,
      clientId: clientObjectId,
      lastReadAt: now,
    });

    this.logger.log(
      `event=inbox.read conversationId=${input.conversationId} clientId=${
        input.clientId
      } actorClientUserId=${
        input.actorClientUserId
      } lastReadAt=${now.toISOString()}`,
    );

    return {
      conversationId: input.conversationId,
      unread: false,
      lastReadAt: now,
    };
  }

  async markUnread(input: MarkReadInput): Promise<MarkReadResponseDto> {
    this.requireValidObjectIds(
      input.clientId,
      input.conversationId,
      input.actorClientUserId,
    );

    const conversationObjectId = new Types.ObjectId(input.conversationId);
    const clientObjectId = new Types.ObjectId(input.clientId);
    const actorObjectId = new Types.ObjectId(input.actorClientUserId);

    const existing = await this.conversationRepository.findByIdForClient(
      conversationObjectId,
      clientObjectId,
    );
    if (!existing) {
      throw new NotFoundException('Conversation not found');
    }

    await this.conversationReadRepository.markUnread({
      conversationId: conversationObjectId,
      operatorClientUserId: actorObjectId,
      clientId: clientObjectId,
    });

    this.logger.log(
      `event=inbox.unread conversationId=${input.conversationId} clientId=${input.clientId} actorClientUserId=${input.actorClientUserId}`,
    );

    return {
      conversationId: input.conversationId,
      unread: true,
      lastReadAt: null,
    };
  }

  async replaceTags(input: ReplaceTagsInput): Promise<ConversationSummaryDto> {
    this.requireValidObjectIds(
      input.clientId,
      input.conversationId,
      input.actorClientUserId,
    );

    const conversationObjectId = new Types.ObjectId(input.conversationId);
    const clientObjectId = new Types.ObjectId(input.clientId);
    const actorObjectId = new Types.ObjectId(input.actorClientUserId);

    const existing = await this.conversationRepository.findByIdForClient(
      conversationObjectId,
      clientObjectId,
    );
    if (!existing) {
      throw new NotFoundException('Conversation not found');
    }

    // P3. Normalize: trim + lowercase + dedupe; preserve insertion order.
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const raw of input.tags) {
      const t = String(raw).trim().toLowerCase();
      if (t.length === 0) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      normalized.push(t);
    }

    // P4. Defensive double-check on the post-dedupe count. DTO enforces
    // ≤ 16 on the wire; this assertion is cheap and prevents future drift
    // if the dedupe rule changes.
    if (normalized.length > MAX_TAGS) {
      throw new BadRequestException(
        `tags array exceeds maximum size of ${MAX_TAGS} after dedupe`,
      );
    }

    const fromTags = existing.tags ?? [];
    // P5. Idempotent short-circuit when the normalized array equals the
    // existing one (same length AND same elements in the same order).
    if (
      fromTags.length === normalized.length &&
      fromTags.every((t, i) => t === normalized[i])
    ) {
      return this.resolveSummary(
        conversationObjectId,
        clientObjectId,
        actorObjectId,
      );
    }

    const updated = await this.conversationRepository.updateTagsForClient(
      conversationObjectId,
      clientObjectId,
      normalized,
    );
    if (!updated) {
      throw new NotFoundException('Conversation not found');
    }

    this.logger.log(
      `event=inbox.tags.changed conversationId=${String(
        updated._id,
      )} clientId=${input.clientId} actorClientUserId=${
        input.actorClientUserId
      } fromTags=[${fromTags.join(',')}] toTags=[${normalized.join(',')}]`,
    );

    return this.resolveSummary(
      conversationObjectId,
      clientObjectId,
      actorObjectId,
    );
  }

  /**
   * Re-reads the conversation with the full set of inbox joins and maps
   * to `ConversationSummaryDto` so the wire shape is identical to what
   * `InboxService.listConversations` produces. Used for status /
   * assignment / tags responses.
   */
  private async resolveSummary(
    conversationId: Types.ObjectId,
    clientId: Types.ObjectId,
    actorClientUserId: Types.ObjectId,
  ): Promise<ConversationSummaryDto> {
    const enriched = await this.conversationRepository.findOneForInboxEnriched(
      conversationId,
      clientId,
      actorClientUserId,
    );
    if (!enriched) {
      throw new NotFoundException('Conversation not found');
    }
    return toConversationSummary(enriched);
  }

  private requireValidObjectIds(...values: string[]): void {
    for (const value of values) {
      if (!Types.ObjectId.isValid(value)) {
        throw new BadRequestException('Invalid ObjectId in mutation input');
      }
    }
  }
}
