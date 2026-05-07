import { Model } from 'mongoose';
import { ClientAgent } from '@persistence/schemas/client-agent.schema';

export const description =
  'Hire-lifecycle reconciliation enum extension. Adds the "pending" and ' +
  '"quarantined" values to webhookRegistration.status. The reconciler at ' +
  'src/core/orchestrator/lifecycle/webhook-registration.reconciler.ts is the ' +
  'live driver of recovery; this file is non-destructive and exists as the ' +
  'documented host for an operator-invoked one-shot reset of quarantined rows ' +
  'back to pending. NOT auto-run on boot.';

export interface ResetQuarantinedInput {
  /** Specific telegramBotIds to reset; if empty, resets all quarantined rows. */
  telegramBotIds?: string[];
}

export interface ResetQuarantinedResult {
  matched: number;
  modified: number;
}

/**
 * Resets quarantined telegram webhookRegistration rows back to pending so the
 * reconciler picks them up on the next tick. Operator-invoked only.
 */
export async function runIfRequested(
  model: Model<ClientAgent>,
  input: ResetQuarantinedInput = {},
): Promise<ResetQuarantinedResult> {
  const filter: Record<string, unknown> = {
    'channels.webhookRegistration.status': 'quarantined',
  };
  if (input.telegramBotIds && input.telegramBotIds.length > 0) {
    filter['channels.telegramBotId'] = { $in: input.telegramBotIds };
  }
  const arrayFilterCh: Record<string, unknown> = {
    'ch.webhookRegistration.status': 'quarantined',
  };
  if (input.telegramBotIds && input.telegramBotIds.length > 0) {
    arrayFilterCh['ch.telegramBotId'] = { $in: input.telegramBotIds };
  }
  const res = await model
    .updateMany(
      filter,
      {
        $set: {
          'channels.$[ch].webhookRegistration.status': 'pending',
          'channels.$[ch].webhookRegistration.attemptCount': 0,
          'channels.$[ch].webhookRegistration.lastError': null,
        },
      },
      { arrayFilters: [{ ch: arrayFilterCh }] },
    )
    .exec();

  return { matched: res.matchedCount ?? 0, modified: res.modifiedCount ?? 0 };
}
