import { Injectable, Logger } from '@nestjs/common';
import { LeadLifecycleService } from '@domain/leads/lead-lifecycle.service';
import type { LeadFields, LeadState } from '@domain/leads/lead.types';
import { LeadRepository } from '@persistence/repositories/lead.repository';
import { LeadNotFoundError } from './lead-bootstrap.errors';

export interface LeadBootstrapUpsertInput {
  clientId: string;
  conversationId: string;
  contactId: string;
  agentId: string;
}

export interface LeadBootstrapApplyInput {
  clientId: string;
  conversationId: string;
  input: {
    fields: Partial<LeadFields>;
    disqualify?: boolean;
  };
}

/**
 * Agent-layer orchestrator for the lead lifecycle. Owns the pre-flight
 * stub upsert (idempotent, called once per agent run for lead-qualifier
 * kinds) and the tool-driven update path (read → merge → compute state →
 * persist).
 *
 * Layer: `agent/`. Imports only from `@domain/leads/*` and
 * `@persistence/repositories/lead.repository` — both inward dependencies.
 */
@Injectable()
export class LeadBootstrapService {
  private readonly logger = new Logger(LeadBootstrapService.name);

  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly leadLifecycleService: LeadLifecycleService,
  ) {}

  async upsertStub(
    args: LeadBootstrapUpsertInput,
  ): Promise<{ leadId: string }> {
    const lead = await this.leadRepository.upsertStub({
      clientId: args.clientId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      agentId: args.agentId,
    });
    const leadId = (lead._id as { toString(): string }).toString();
    this.logger.log(
      JSON.stringify({
        event: 'lead_bootstrap_stub',
        leadId,
        clientId: args.clientId,
        conversationId: args.conversationId,
        state: lead.state,
      }),
    );
    return { leadId };
  }

  async applyUpdate(
    args: LeadBootstrapApplyInput,
  ): Promise<{ state: LeadState }> {
    const current = await this.leadRepository.findByConversation(
      args.clientId,
      args.conversationId,
    );
    if (!current) {
      throw new LeadNotFoundError(args.clientId, args.conversationId);
    }

    const merged = this.leadLifecycleService.mergeFields(
      (current.fields ?? {}) as LeadFields,
      args.input.fields,
    );
    const nextState = this.leadLifecycleService.computeNextState(
      merged,
      args.input.disqualify === true,
      current.state as LeadState,
    );

    await this.leadRepository.applyUpdate(current._id as never, {
      fields: merged as Record<string, unknown>,
      state: nextState,
      lastQualificationAt: new Date(),
    });

    this.logger.log(
      JSON.stringify({
        event: 'lead_bootstrap_update',
        leadId: (current._id as { toString(): string }).toString(),
        clientId: args.clientId,
        conversationId: args.conversationId,
        previousState: current.state,
        nextState,
      }),
    );

    return { state: nextState };
  }
}
