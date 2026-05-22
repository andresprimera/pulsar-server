import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead } from '@persistence/schemas/lead.schema';
import type { LeadState } from '@shared/lead-state.constants';

export interface LeadUpsertStubInput {
  clientId: string | Types.ObjectId;
  conversationId: string | Types.ObjectId;
  contactId: string | Types.ObjectId;
  agentId: string | Types.ObjectId;
}

export interface LeadApplyUpdatePatch {
  fields: Record<string, unknown>;
  state: LeadState;
  lastQualificationAt: Date;
}

@Injectable()
export class LeadRepository {
  private readonly logger = new Logger(LeadRepository.name);

  constructor(
    @InjectModel(Lead.name)
    private readonly model: Model<Lead>,
  ) {}

  async findByConversation(
    clientId: string | Types.ObjectId,
    conversationId: string | Types.ObjectId,
  ): Promise<Lead | null> {
    return this.model
      .findOne({
        clientId: toObjectId(clientId),
        conversationId: toObjectId(conversationId),
      })
      .exec();
  }

  /**
   * Idempotent stub insert. Never overwrites existing `state` or `fields`
   * (uses `$setOnInsert` exclusively). Catches E11000 (duplicate key from
   * the unique `(clientId, conversationId)` index) and re-reads as
   * fallback, per `docs/rules/data-modeling.md`.
   */
  async upsertStub(input: LeadUpsertStubInput): Promise<Lead> {
    const clientId = toObjectId(input.clientId);
    const conversationId = toObjectId(input.conversationId);
    const contactId = toObjectId(input.contactId);
    const agentId = toObjectId(input.agentId);

    const filter = { clientId, conversationId };
    const setOnInsert = {
      clientId,
      conversationId,
      contactId,
      agentId,
      state: 'new' as LeadState,
      fields: {},
    };

    try {
      const lead = await this.model
        .findOneAndUpdate(
          filter,
          { $setOnInsert: setOnInsert },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .exec();
      return lead as Lead;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        this.logger.warn(
          `event=lead_duplicate_key_retry clientId=${clientId.toString()} conversationId=${conversationId.toString()}`,
        );
        const existing = await this.model.findOne(filter).exec();
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async applyUpdate(
    leadId: string | Types.ObjectId,
    patch: LeadApplyUpdatePatch,
  ): Promise<Lead | null> {
    return this.model
      .findByIdAndUpdate(toObjectId(leadId), { $set: patch }, { new: true })
      .exec();
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    );
  }
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}
