/**
 * Conversation control-mode enum.
 *
 * `'bot'`   — autopilot. Inbound messages are handled by `AgentService`.
 * `'human'` — autopilot suspended. The orchestrator suppresses
 *             `agentService.run` AND `conversationService.touch` for
 *             inbound messages on this conversation.
 *
 * Forward-only per `docs/rules/data-modeling.md`: values may be added but
 * never removed (a rollback must leave the schema enum intact).
 */
export const CONTROL_MODES = ['bot', 'human'] as const;

export type ControlMode = (typeof CONTROL_MODES)[number];

export const DEFAULT_CONTROL_MODE: ControlMode = 'bot';
