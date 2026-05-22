import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import type { AgentToolRunCorrelation } from '@agent/tooling/agent-tool-run-correlation';
import { sanitizeToolLogArgument } from '@agent/tooling/redact-tool-string.util';
import type { LeadBootstrapService } from './lead-bootstrap.service';

/**
 * Canonical description string surfaced to the LLM. Pinned as an exported
 * constant so the unit spec can assert byte-for-byte stability.
 */
export const RECORD_LEAD_QUALIFICATION_TOOL_DESCRIPTION =
  'Record any qualification fields you have captured with high confidence (budget amount/currency, intent statement, timeline horizon, contact preferences, or freeform notes). You may also set `disqualify: true` to immediately disqualify this lead. Call this tool whenever you learn a new fact; you do NOT need all fields in one call. The system maintains state transitions deterministically — focus on capturing facts the contact has actually stated.';

const inputSchema = z.object({
  budget: z
    .object({
      amount: z.number().nonnegative().optional(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/, 'ISO 4217')
        .optional(),
    })
    .optional(),
  intent: z.string().min(1).max(500).optional(),
  timeline: z
    .object({
      horizon: z.string().min(1).max(120).optional(),
    })
    .optional(),
  notes: z.string().min(1).max(2000).optional(),
  disqualify: z.boolean().optional(),
  contactPreferences: z
    .object({
      preferredChannel: z.string().min(1).max(60).optional(),
      preferredTime: z.string().min(1).max(120).optional(),
    })
    .optional(),
});

type RecordLeadQualificationInput = z.infer<typeof inputSchema>;

function hasAnyPopulatedField(input: RecordLeadQualificationInput): boolean {
  if (input.disqualify !== undefined) return true;
  if (input.intent !== undefined) return true;
  if (input.notes !== undefined) return true;
  if (input.budget !== undefined) {
    if (
      input.budget.amount !== undefined ||
      input.budget.currency !== undefined
    ) {
      return true;
    }
  }
  if (input.timeline !== undefined && input.timeline.horizon !== undefined) {
    return true;
  }
  if (input.contactPreferences !== undefined) {
    if (
      input.contactPreferences.preferredChannel !== undefined ||
      input.contactPreferences.preferredTime !== undefined
    ) {
      return true;
    }
  }
  return false;
}

/**
 * AI SDK tool factory for `record_lead_qualification`. Persists structured
 * qualification facts via {@link LeadBootstrapService.applyUpdate}.
 *
 * The Vercel AI SDK auto-invokes `execute` during `generateText`, so all
 * persistence happens inline within the LLM turn — no post-run drain.
 */
export function createRecordLeadQualificationTool(
  logger: Logger,
  runCorrelation: AgentToolRunCorrelation,
  leadBootstrapService: LeadBootstrapService,
) {
  return tool({
    description: RECORD_LEAD_QUALIFICATION_TOOL_DESCRIPTION,
    // Zod + `tool` inference can exceed TS recursion depth; runtime schema is unchanged.
    inputSchema: inputSchema as never,
    execute: async (raw: unknown) => {
      const input = inputSchema.parse(raw);

      if (!hasAnyPopulatedField(input)) {
        logger.log(
          JSON.stringify({
            event: 'agent_tool_record_lead_qualification_empty',
            clientId: runCorrelation.clientId,
            conversationId: runCorrelation.conversationId,
            agentId: runCorrelation.agentId,
          }),
        );
        return { ok: false as const, error: 'no fields to record' };
      }

      const fields: Record<string, unknown> = {};
      if (input.budget !== undefined) {
        fields.budget = input.budget;
      }
      if (input.intent !== undefined) {
        fields.intent = input.intent;
      }
      if (input.timeline !== undefined) {
        fields.timeline = input.timeline;
      }
      if (input.notes !== undefined) {
        fields.notes = [sanitizeToolLogArgument(input.notes, 2000)];
      }
      if (input.contactPreferences !== undefined) {
        fields.contactPreferences = input.contactPreferences;
      }

      try {
        const { state } = await leadBootstrapService.applyUpdate({
          clientId: runCorrelation.clientId,
          conversationId: runCorrelation.conversationId,
          input: {
            fields: fields as never,
            disqualify: input.disqualify,
          },
        });

        logger.log(
          JSON.stringify({
            event: 'agent_tool_record_lead_qualification',
            clientId: runCorrelation.clientId,
            conversationId: runCorrelation.conversationId,
            agentId: runCorrelation.agentId,
            channelId: runCorrelation.channelId,
            contactId: runCorrelation.contactId,
            profile: runCorrelation.toolingProfileId,
            kind: runCorrelation.agentKind,
            state,
            capturedKeys: Object.keys(fields),
            disqualify: input.disqualify === true,
          }),
        );

        return { ok: true as const, state };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          JSON.stringify({
            event: 'agent_tool_record_lead_qualification_error',
            clientId: runCorrelation.clientId,
            conversationId: runCorrelation.conversationId,
            agentId: runCorrelation.agentId,
            error: sanitizeToolLogArgument(message, 256),
          }),
        );
        return { ok: false as const, error: message };
      }
    },
  });
}
