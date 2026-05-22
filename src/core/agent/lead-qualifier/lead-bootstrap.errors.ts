/**
 * Thrown by {@link LeadBootstrapService.applyUpdate} when the caller tries
 * to apply a qualification update to a `(clientId, conversationId)` for
 * which no Lead document has been bootstrapped yet.
 *
 * The agent's pre-flight stub upsert (run by {@link AgentService.run} for
 * `agentKind === 'lead_qualifier'`) is meant to make this path unreachable;
 * if it surfaces in production it indicates the pre-flight failed silently
 * and the tool should report a non-fatal error to the LLM so the turn can
 * continue.
 */
export class LeadNotFoundError extends Error {
  constructor(clientId: string, conversationId: string) {
    super(
      `No lead found for clientId=${clientId} conversationId=${conversationId}`,
    );
    this.name = 'LeadNotFoundError';
  }
}
