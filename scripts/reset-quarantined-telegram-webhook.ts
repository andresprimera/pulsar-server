import 'reflect-metadata';
import mongoose from 'mongoose';
import {
  ClientAgent,
  ClientAgentSchema,
} from '../src/core/persistence/schemas/client-agent.schema';
import { runIfRequested } from '../src/core/persistence/migrations/202605-webhook-registration-pending-default';

/**
 * Operator CLI: resets quarantined Telegram webhookRegistration rows back to
 * `pending` so the WebhookRegistrationReconciler picks them up on its next
 * tick.
 *
 * Usage:
 *   pnpm --filter pulsar-server exec ts-node \
 *     scripts/reset-quarantined-telegram-webhook.ts -- 1234567890 9876543210
 *
 * If no botIds are supplied, ALL quarantined rows are reset (use with care).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const telegramBotIds = args.length > 0 ? args : undefined;

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pulsar';
  console.log(
    `Connecting to ${uri.replace(/:([^:@]+)@/, ':****@')} ...`,
  );
  await mongoose.connect(uri);

  try {
    const model = mongoose.model<ClientAgent>(
      ClientAgent.name,
      ClientAgentSchema,
    );

    if (telegramBotIds) {
      console.log(
        `Resetting quarantined rows for ${telegramBotIds.length} botId(s): ${telegramBotIds.join(', ')}`,
      );
    } else {
      console.log('Resetting ALL quarantined rows.');
    }

    const result = await runIfRequested(model, { telegramBotIds });
    console.log(
      `Done. matched=${result.matched} modified=${result.modified}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
