import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AppModule } from '../src/app.module';

/**
 * Dev/demo seeder: drops one realistic Conversation + Contact + a couple
 * of Messages onto the sales hire that lives on the seeded
 * "Andres Company Inc." tenant. Idempotent — running it twice deletes
 * the previously seeded fixtures (by their stable `metadata.demoTag`)
 * before re-inserting, so the conversation IDs change but counts do not.
 *
 * Why this exists: the inbox runtime validator (see frontend AC-9) needs
 * a clickable conversation row on a sales hire to prove the
 * conversation-detail route works end-to-end. The main `seed-data.json`
 * fixtures stop at hires + channels and do not seed any conversation
 * threads, which left the sales-hire inbox empty.
 *
 * NOT run automatically. Invoke explicitly:
 *   pnpm tsx scripts/seed-sales-demo-conversation.ts
 * or
 *   ts-node -r tsconfig-paths/register scripts/seed-sales-demo-conversation.ts
 *
 * Requires the standard backend env (Mongo connection string, etc.) the
 * AppModule already consumes.
 */

const DEMO_TAG = 'seed-sales-demo-conversation';
const TENANT_NAME = 'Andres Company Inc.';
const HIRE_AGENT_NAME = 'Lead Qualifier & Sales Agent';

interface SeedSummary {
  tenantId: Types.ObjectId;
  hireId: Types.ObjectId;
  channelId: Types.ObjectId;
  contactId: Types.ObjectId;
  conversationId: Types.ObjectId;
  messageIds: Types.ObjectId[];
}

async function resolveFixtureContext(
  connection: Connection,
): Promise<{
  tenantId: Types.ObjectId;
  hireId: Types.ObjectId;
  agentId: Types.ObjectId;
  channelId: Types.ObjectId;
}> {
  const client = await connection
    .collection('clients')
    .findOne({ name: TENANT_NAME });
  if (client === null) {
    throw new Error(
      `Tenant "${TENANT_NAME}" not found. Run the main seed first (\`pnpm db:reset\`).`,
    );
  }

  const agent = await connection
    .collection('agents')
    .findOne({ name: HIRE_AGENT_NAME });
  if (agent === null) {
    throw new Error(
      `Agent "${HIRE_AGENT_NAME}" not found in the agents collection.`,
    );
  }

  // `ClientAgent.clientId` and `ClientAgent.agentId` are stored as hex
  // strings (not ObjectIds) — see client-agent.schema.ts. The conversation /
  // contact / message collections use `Types.ObjectId` for the tenant id,
  // so we cast back when seeding those.
  const hire = await connection.collection('client_agents').findOne({
    clientId: (client._id as Types.ObjectId).toHexString(),
    agentId: (agent._id as Types.ObjectId).toHexString(),
    status: 'active',
  });
  if (hire === null) {
    throw new Error(
      `Active hire for ("${TENANT_NAME}", "${HIRE_AGENT_NAME}") not found. Check the main seed.`,
    );
  }

  // Channels are embedded inside the hire's `channels[]` array (see
  // `HireChannelConfig` in client-agent.schema.ts); `channelId` on each
  // embedded entry references the global `channels` catalog collection.
  // The demo conversation is provider-agnostic — first active channel
  // wins.
  const hireRecord = hire as unknown as {
    channels?: Array<{ channelId: Types.ObjectId; status: string }>;
  };
  const hireChannels = Array.isArray(hireRecord.channels)
    ? hireRecord.channels
    : [];
  const channelConfig = hireChannels.find((c) => c.status === 'active');
  if (channelConfig === undefined) {
    throw new Error(
      `No active embedded channel found on hire ${hire._id.toString()}. Check the main seed.`,
    );
  }

  return {
    tenantId: client._id as Types.ObjectId,
    hireId: hire._id as Types.ObjectId,
    agentId: agent._id as Types.ObjectId,
    channelId: channelConfig.channelId,
  };
}

async function cleanupPriorSeed(connection: Connection): Promise<void> {
  // Order matters: messages → conversation → contact. Each is keyed by
  // `metadata.demoTag === DEMO_TAG` so re-runs are idempotent without
  // touching real conversations on the same tenant.
  const priorConversation = await connection
    .collection('conversations')
    .findOne({ 'metadata.demoTag': DEMO_TAG });
  if (priorConversation !== null) {
    await connection
      .collection('messages')
      .deleteMany({ conversationId: priorConversation._id });
    await connection
      .collection('conversations')
      .deleteOne({ _id: priorConversation._id });
  }
  await connection
    .collection('contacts')
    .deleteMany({ 'metadata.demoTag': DEMO_TAG });
}

async function insertFixtures(
  connection: Connection,
  ctx: {
    tenantId: Types.ObjectId;
    hireId: Types.ObjectId;
    agentId: Types.ObjectId;
    channelId: Types.ObjectId;
  },
): Promise<SeedSummary> {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const fourMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000);
  const threeMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);

  const contactId = new Types.ObjectId();
  const conversationId = new Types.ObjectId();
  const userMsgId = new Types.ObjectId();
  const agentMsgId = new Types.ObjectId();

  await connection.collection('contacts').insertOne({
    _id: contactId,
    externalId: `demo-sales-contact-${Date.now()}`,
    identifier: { type: 'phone', value: '+15551230000' },
    clientId: ctx.tenantId,
    channelId: ctx.channelId,
    name: 'Demo Lead — Sofia Martinez',
    metadata: { demoTag: DEMO_TAG },
    status: 'active',
    createdAt: fiveMinutesAgo,
    updatedAt: fiveMinutesAgo,
  });

  await connection.collection('conversations').insertOne({
    _id: conversationId,
    clientId: ctx.tenantId,
    contactId,
    channelId: ctx.channelId,
    clientAgentId: ctx.hireId,
    status: 'open',
    controlMode: 'bot',
    lastMessageAt: threeMinutesAgo,
    lastMessagePreview:
      'Great — I can put you on the early-access list. What size company are you with?',
    contactNameLower: 'demo lead — sofia martinez',
    metadata: { demoTag: DEMO_TAG },
    tags: [],
    createdAt: fiveMinutesAgo,
    updatedAt: threeMinutesAgo,
  });

  await connection.collection('messages').insertMany([
    {
      _id: userMsgId,
      content:
        'Hi! I saw your ad on Instagram — are you taking new customers right now?',
      type: 'user',
      contactId,
      clientId: ctx.tenantId,
      channelId: ctx.channelId,
      conversationId,
      status: 'active',
      createdAt: fourMinutesAgo,
      updatedAt: fourMinutesAgo,
    },
    {
      _id: agentMsgId,
      content:
        'Great — I can put you on the early-access list. What size company are you with?',
      type: 'agent',
      agentId: ctx.agentId,
      clientId: ctx.tenantId,
      channelId: ctx.channelId,
      conversationId,
      status: 'active',
      createdAt: threeMinutesAgo,
      updatedAt: threeMinutesAgo,
    },
  ]);

  return {
    tenantId: ctx.tenantId,
    hireId: ctx.hireId,
    channelId: ctx.channelId,
    contactId,
    conversationId,
    messageIds: [userMsgId, agentMsgId],
  };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const ctx = await resolveFixtureContext(connection);
    await cleanupPriorSeed(connection);
    const summary = await insertFixtures(connection, ctx);

    console.log('Seeded sales-hire demo conversation:');
    console.log(`  tenantId       = ${summary.tenantId.toString()}`);
    console.log(`  hireId         = ${summary.hireId.toString()}`);
    console.log(`  channelId      = ${summary.channelId.toString()}`);
    console.log(`  contactId      = ${summary.contactId.toString()}`);
    console.log(`  conversationId = ${summary.conversationId.toString()}`);
    console.log(`  messages       = ${summary.messageIds.length}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
