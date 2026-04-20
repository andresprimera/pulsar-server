import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import type { AgentToolRunCorrelation } from './agent-tool-run-correlation';
import { sanitizeToolLogArgument } from './redact-tool-string.util';

const inputSchema = z.object({
  message: z
    .string()
    .min(1)
    .max(600, { message: 'message exceeds maximum length' }),
  level: z.enum(['debug', 'info', 'warn']).optional(),
});

/**
 * Minimal structured log tool to validate AI SDK tool wiring end-to-end.
 */
export function createAgentDebugLogTool(
  logger: Logger,
  runCorrelation: AgentToolRunCorrelation,
) {
  return tool({
    description:
      'Emit a short structured debug log for this agent turn. Do not include secrets, credentials, API keys, or full transcripts.',
    // Zod + `tool` inference can exceed TS recursion depth; runtime schema is unchanged.
    inputSchema: inputSchema as never,
    execute: async (raw: unknown) => {
      const input = inputSchema.parse(raw);
      const safeMessage = sanitizeToolLogArgument(input.message, 512);
      logger.log(
        JSON.stringify({
          event: 'agent_tool_agent_debug_log',
          clientId: runCorrelation.clientId,
          conversationId: runCorrelation.conversationId,
          agentId: runCorrelation.agentId,
          channelId: runCorrelation.channelId,
          contactId: runCorrelation.contactId,
          profile: runCorrelation.toolingProfileId,
          level: input.level ?? 'info',
          message: safeMessage,
        }),
      );
      return { ok: true as const };
    },
  });
}
