import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import * as SEED_DATA from '../src/core/persistence/data/seed-data.json';

describe('Seeder (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let previousSeedDb: string | undefined;

  beforeAll(async () => {
    previousSeedDb = process.env.SEED_DB;
    process.env.SEED_DB = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    connection = moduleFixture.get<Connection>(getConnectionToken());
    await connection.asPromise();

    // Clean up any existing seed data before app bootstrap triggers seeding
    await cleanupSeededData();

    await app.init();
  });

  afterAll(async () => {
    await cleanupSeededData();
    await app.close();

    if (previousSeedDb === undefined) {
      delete process.env.SEED_DB;
    } else {
      process.env.SEED_DB = previousSeedDb;
    }
  });

  const cleanupSeededData = async () => {
    if (connection) {
      const seedEmails = SEED_DATA.users.map((u) => u.email);

      const seededUsers = await connection
        .collection('users')
        .find({ email: { $in: seedEmails } })
        .toArray();
      const clientIds = seededUsers.map((u) => u.clientId);

      const seededPhoneNumberIds = SEED_DATA.users.flatMap((u) =>
        (u.agentHirings || []).flatMap((h) =>
          (h.channels || [])
            .map((c) => (c.credentials as any)?.phoneNumberId)
            .filter((phone): phone is string => Boolean(phone)),
        ),
      );

      const uniqueSeededPhoneNumberIds = [...new Set(seededPhoneNumberIds)];

      // Clean up seeded client_phones first to avoid ownership conflicts on next run
      await connection.collection('client_phones').deleteMany({
        $or: [
          { clientId: { $in: clientIds } },
          { phoneNumberId: { $in: uniqueSeededPhoneNumberIds } },
        ],
      });

      // Clean up seeded client_agents
      await connection.collection('client_agents').deleteMany({
        clientId: { $in: clientIds.map((id) => id.toString()) },
      });

      // Clean up seeded clients and their billing records
      await connection.collection('billing_records').deleteMany({
        clientId: { $in: clientIds },
      });
      await connection.collection('clients').deleteMany({
        _id: { $in: clientIds },
      });

      // Clean up seeded agents and their catalog prices
      const seededAgents = await connection
        .collection('agents')
        .find({ createdBySeeder: true })
        .toArray();
      const seededAgentIds = seededAgents.map((a) => a._id);
      await connection.collection('agent_prices').deleteMany({
        agentId: { $in: seededAgentIds },
      });
      await connection.collection('agents').deleteMany({
        createdBySeeder: true,
      });

      const seedChannelNames = SEED_DATA.channels.map((c) => c.name);
      const seededChannels = await connection
        .collection('channels')
        .find({ name: { $in: seedChannelNames } })
        .toArray();
      const seededChannelIds = seededChannels.map((c) => c._id);
      await connection.collection('channel_prices').deleteMany({
        channelId: { $in: seededChannelIds },
      });

      // Clean up seeded users
      await connection.collection('users').deleteMany({
        email: { $in: seedEmails },
      });

      // Clean up seeded channels from seed data
      await connection.collection('channels').deleteMany({
        name: { $in: seedChannelNames },
      });
    }
  };

  // Extract seed data references for readability
  const seedUser1 = SEED_DATA.users[0];
  const seedUser2 = SEED_DATA.users[1];
  const seedUser3 = SEED_DATA.users[2];

  describe('Agent Creation Tests', () => {
    it('should create all seeded catalog agents', async () => {
      const agents = await connection
        .collection('agents')
        .find({ createdBySeeder: true })
        .toArray();

      expect(agents).toHaveLength(SEED_DATA.agents.length);

      const agentNames = agents.map((a) => a.name);
      expect(agentNames).toContain('Customer Service Agent');
      expect(agentNames).toContain('Lead Qualifier & Sales Agent');
      expect(agentNames).toContain('Order & Sales Agent');
    });

    it('should create agents with correct properties', async () => {
      const customerServiceAgent = await connection
        .collection('agents')
        .findOne({ name: 'Customer Service Agent', createdBySeeder: true });

      expect(customerServiceAgent).toBeDefined();
      expect(customerServiceAgent.systemPrompt).toContain(
        'customer service representative',
      );
      expect(customerServiceAgent.status).toBe('active');
      expect(customerServiceAgent.createdBySeeder).toBe(true);
      expect(customerServiceAgent.toolingProfileId).toBe('internal-debug');

      const salesAgent = await connection.collection('agents').findOne({
        name: 'Lead Qualifier & Sales Agent',
        createdBySeeder: true,
      });

      expect(salesAgent).toBeDefined();
      expect(salesAgent.systemPrompt).toContain('sales and lead qualification');
      expect(salesAgent.status).toBe('active');
      expect(salesAgent.createdBySeeder).toBe(true);
      expect(salesAgent.toolingProfileId).toBeUndefined();

      const orderSalesAgent = await connection.collection('agents').findOne({
        name: 'Order & Sales Agent',
        createdBySeeder: true,
      });

      expect(orderSalesAgent).toBeDefined();
      expect(orderSalesAgent.systemPrompt).toContain('order-taking');
      expect(orderSalesAgent.status).toBe('active');
      expect(orderSalesAgent.createdBySeeder).toBe(true);
      expect(orderSalesAgent.toolingProfileId).toBeUndefined();
    });
  });

  describe('Channel Infrastructure Tests', () => {
    it('should provision WhatsApp, TikTok, Instagram, and Telegram channels', async () => {
      const whatsappChannel = await connection
        .collection('channels')
        .findOne({ name: 'WhatsApp' });

      expect(whatsappChannel).toBeDefined();
      expect(whatsappChannel.type).toBe('whatsapp');

      const tiktokChannel = await connection
        .collection('channels')
        .findOne({ name: 'TikTok' });

      expect(tiktokChannel).toBeDefined();
      expect(tiktokChannel.type).toBe('tiktok');

      const instagramChannel = await connection
        .collection('channels')
        .findOne({ name: 'Instagram' });

      expect(instagramChannel).toBeDefined();
      expect(instagramChannel.type).toBe('instagram');

      const telegramChannel = await connection
        .collection('channels')
        .findOne({ name: 'Telegram' });

      expect(telegramChannel).toBeDefined();
      expect(telegramChannel.type).toBe('telegram');
    });

    it('should set correct supportedProviders for channels', async () => {
      const whatsappChannel = await connection
        .collection('channels')
        .findOne({ name: 'WhatsApp' });

      expect(whatsappChannel.supportedProviders).toContain('meta');
      expect(whatsappChannel.supportedProviders).toContain('twilio');

      const tiktokChannel = await connection
        .collection('channels')
        .findOne({ name: 'TikTok' });

      expect(tiktokChannel.supportedProviders).toContain('tiktok');

      const instagramChannel = await connection
        .collection('channels')
        .findOne({ name: 'Instagram' });

      expect(instagramChannel.supportedProviders).toContain('instagram');

      const telegramChannel = await connection
        .collection('channels')
        .findOne({ name: 'Telegram' });

      expect(telegramChannel.supportedProviders).toContain('telegram');
    });
  });

  describe(`User 1 Tests (${seedUser1.email})`, () => {
    it('should create User 1 successfully with correct email/name', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser1.email });

      expect(user).toBeDefined();
      expect(user.name).toBe(seedUser1.name);
      expect(user.status).toBe('active');
    });

    it(`should create User 1 client as ${seedUser1.client.type} type`, async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser1.email });

      const client = await connection
        .collection('clients')
        .findOne({ _id: user.clientId });

      expect(client).toBeDefined();
      expect(client.type).toBe(seedUser1.client.type);
      expect(client.status).toBe('active');
      expect(client.billingCurrency).toBe(
        (SEED_DATA as any).billingCurrency ?? 'USD',
      );
      expect(client.billingAnchor).toBeDefined();
      expect(client.billingAnchor).toBeInstanceOf(Date);
    });

    it(`should hire ${seedUser1.agentHirings[0].agentName} for User 1`, async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser1.email });

      const agent = await connection
        .collection('agents')
        .findOne({ name: seedUser1.agentHirings[0].agentName });

      const clientAgents = await connection
        .collection('client_agents')
        .find({
          clientId: user.clientId.toString(),
          agentId: agent._id.toString(),
        })
        .toArray();

      expect(clientAgents).toHaveLength(1);
      expect(clientAgents[0].status).toBe('active');
      expect(clientAgents[0].agentPricing?.amount).toBe(
        seedUser1.agentHirings[0].price,
      );
    });

    it('should configure User 1 with the correct channels', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser1.email });

      const agent = await connection
        .collection('agents')
        .findOne({ name: seedUser1.agentHirings[0].agentName });

      const clientAgent = await connection.collection('client_agents').findOne({
        clientId: user.clientId.toString(),
        agentId: agent._id.toString(),
      });

      const expectedChannelNames = seedUser1.agentHirings[0].channels.map(
        (c) => c.channelName,
      );
      expect(clientAgent.channels).toHaveLength(expectedChannelNames.length);

      const channelDocs = await Promise.all(
        expectedChannelNames.map((name) =>
          connection.collection('channels').findOne({ name }),
        ),
      );

      const channelIds = clientAgent.channels.map((c) =>
        c.channelId.toString(),
      );
      for (const channelDoc of channelDocs) {
        expect(channelIds).toContain(channelDoc._id.toString());
      }
    });
  });

  describe(`User 2 Tests (${seedUser2.email})`, () => {
    it('should create User 2 successfully', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser2.email });

      expect(user).toBeDefined();
      expect(user.name).toBe(seedUser2.name);
      expect(user.status).toBe('active');
    });

    it(`should hire ${seedUser2.agentHirings[0].agentName} for User 2`, async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser2.email });

      const agent = await connection
        .collection('agents')
        .findOne({ name: seedUser2.agentHirings[0].agentName });

      const clientAgents = await connection
        .collection('client_agents')
        .find({
          clientId: user.clientId.toString(),
          agentId: agent._id.toString(),
        })
        .toArray();

      expect(clientAgents).toHaveLength(1);
      expect(clientAgents[0].status).toBe('active');
    });

    it('should configure User 2 with the correct channels', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser2.email });

      const agent = await connection
        .collection('agents')
        .findOne({ name: seedUser2.agentHirings[0].agentName });

      const clientAgent = await connection.collection('client_agents').findOne({
        clientId: user.clientId.toString(),
        agentId: agent._id.toString(),
      });

      const expectedChannelNames = seedUser2.agentHirings[0].channels.map(
        (c) => c.channelName,
      );
      expect(clientAgent.channels).toHaveLength(expectedChannelNames.length);

      const channelDocs = await Promise.all(
        expectedChannelNames.map((name) =>
          connection.collection('channels').findOne({ name }),
        ),
      );

      const channelIds = clientAgent.channels.map((c) =>
        c.channelId.toString(),
      );
      for (const channelDoc of channelDocs) {
        expect(channelIds).toContain(channelDoc._id.toString());
      }
    });

    it('should persist organization client name for User 2', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser2.email });

      const client = await connection
        .collection('clients')
        .findOne({ _id: user.clientId });

      expect(client).toBeDefined();
      expect(client.type).toBe(seedUser2.client.type);
      expect(client.name).toBe((seedUser2.client as any).name);
      expect(client.billingCurrency).toBe(
        (SEED_DATA as any).billingCurrency ?? 'USD',
      );
      expect(client.billingAnchor).toBeDefined();
      expect(client.billingAnchor).toBeInstanceOf(Date);
    });
  });

  describe(`User 3 Tests (${seedUser3.email})`, () => {
    it('should create User 3 successfully', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser3.email });

      expect(user).toBeDefined();
      expect(user.name).toBe(seedUser3.name);
      expect(user.status).toBe('active');
    });

    it('should create User 3 client with billingCurrency and billingAnchor', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser3.email });
      const client = await connection
        .collection('clients')
        .findOne({ _id: user.clientId });
      expect(client).toBeDefined();
      expect(client.billingCurrency).toBe(
        (SEED_DATA as any).billingCurrency ?? 'USD',
      );
      expect(client.billingAnchor).toBeDefined();
      expect(client.billingAnchor).toBeInstanceOf(Date);
    });

    it('should hire both agents for User 3', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser3.email });

      const clientAgents = await connection
        .collection('client_agents')
        .find({
          clientId: user.clientId.toString(),
        })
        .toArray();

      expect(clientAgents).toHaveLength(seedUser3.agentHirings.length);
    });

    it(`should have ${seedUser3.agentHirings[0].agentName} as one of User 3 agents`, async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser3.email });

      const agent = await connection
        .collection('agents')
        .findOne({ name: seedUser3.agentHirings[0].agentName });

      const clientAgent = await connection.collection('client_agents').findOne({
        clientId: user.clientId.toString(),
        agentId: agent._id.toString(),
      });

      expect(clientAgent).toBeDefined();
      expect(clientAgent.status).toBe('active');
    });

    it(`should have ${seedUser3.agentHirings[1].agentName} as one of User 3 agents`, async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser3.email });

      const agent = await connection
        .collection('agents')
        .findOne({ name: seedUser3.agentHirings[1].agentName });

      const clientAgent = await connection.collection('client_agents').findOne({
        clientId: user.clientId.toString(),
        agentId: agent._id.toString(),
      });

      expect(clientAgent).toBeDefined();
      expect(clientAgent.status).toBe('active');
    });

    it('should configure both agents with multichannel combinations for User 3', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser3.email });

      const clientAgents = await connection
        .collection('client_agents')
        .find({
          clientId: user.clientId.toString(),
        })
        .toArray();

      const whatsappChannel = await connection
        .collection('channels')
        .findOne({ name: 'WhatsApp' });
      const tiktokChannel = await connection
        .collection('channels')
        .findOne({ name: 'TikTok' });
      const instagramChannel = await connection
        .collection('channels')
        .findOne({ name: 'Instagram' });

      const expectedCounts = seedUser3.agentHirings
        .map((h) => h.channels.length)
        .sort();
      const channelCounts = clientAgents.map((ca) => ca.channels.length).sort();
      expect(channelCounts).toEqual(expectedCounts);

      const flattenedChannelIds = clientAgents.flatMap((ca) =>
        ca.channels.map((c) => c.channelId.toString()),
      );
      expect(flattenedChannelIds).toContain(whatsappChannel._id.toString());
      expect(flattenedChannelIds).toContain(tiktokChannel._id.toString());
      expect(flattenedChannelIds).toContain(instagramChannel._id.toString());
    });

    it('should set WhatsApp phoneNumberId on hiring that has WhatsApp for User 3', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: seedUser3.email });

      const hiring1Agent = await connection
        .collection('agents')
        .findOne({ name: seedUser3.agentHirings[0].agentName });
      const hiring2Agent = await connection
        .collection('agents')
        .findOne({ name: seedUser3.agentHirings[1].agentName });

      const hiring1 = await connection.collection('client_agents').findOne({
        clientId: user.clientId.toString(),
        agentId: hiring1Agent._id.toString(),
      });
      const hiring2 = await connection.collection('client_agents').findOne({
        clientId: user.clientId.toString(),
        agentId: hiring2Agent._id.toString(),
      });

      const hiring1Phone = hiring1.channels.find(
        (channel) => channel.phoneNumberId,
      )?.phoneNumberId;
      const hiring2Phone = hiring2.channels.find(
        (channel) => channel.phoneNumberId,
      )?.phoneNumberId;

      // First hiring has WhatsApp in seed; second hiring has only TikTok + Instagram
      const expectedPhone = (
        seedUser3.agentHirings[0].channels.find(
          (c) => (c.credentials as any).phoneNumberId,
        )?.credentials as any
      )?.phoneNumberId;

      expect(hiring1Phone).toBe(expectedPhone);
      expect(hiring2Phone).toBeUndefined();
    });
  });

  describe('Idempotency Tests', () => {
    it('should not duplicate agents on re-run', async () => {
      const agentsBefore = await connection
        .collection('agents')
        .find({ createdBySeeder: true })
        .toArray();

      expect(agentsBefore).toHaveLength(SEED_DATA.agents.length);

      // Verify no duplicates by name
      const names = agentsBefore.map((a) => a.name);
      const uniqueNames = [...new Set(names)];
      expect(uniqueNames).toHaveLength(SEED_DATA.agents.length);
    });

    it('should not duplicate users on re-run', async () => {
      const userEmails = SEED_DATA.users.map((u) => u.email);

      for (const email of userEmails) {
        const users = await connection
          .collection('users')
          .find({ email })
          .toArray();

        expect(users).toHaveLength(1);
      }
    });
  });

  describe('Phone Number Tests', () => {
    it('should register WhatsApp phone numbers in ClientPhone collection', async () => {
      // Find the first WhatsApp phoneNumberId from seed data
      const firstPhoneNumberId = SEED_DATA.users.flatMap((u) =>
        u.agentHirings.flatMap((h) =>
          h.channels
            .map((c) => (c.credentials as any)?.phoneNumberId)
            .filter(Boolean),
        ),
      )[0];

      const clientPhones = await connection
        .collection('client_phones')
        .find({ phoneNumberId: firstPhoneNumberId })
        .toArray();

      expect(clientPhones.length).toBeGreaterThan(0);
    });

    it('should ensure phone numbers are unique per client', async () => {
      const user1 = await connection
        .collection('users')
        .findOne({ email: seedUser1.email });

      const user2 = await connection
        .collection('users')
        .findOne({ email: seedUser2.email });

      const user1Phones = await connection
        .collection('client_phones')
        .find({ clientId: user1.clientId })
        .toArray();

      const user2Phones = await connection
        .collection('client_phones')
        .find({ clientId: user2.clientId })
        .toArray();

      // User 1 has WhatsApp channels, so should have phone numbers
      const user1HasWhatsApp = seedUser1.agentHirings.some((h) =>
        h.channels.some((c) => (c.credentials as any)?.phoneNumberId),
      );
      if (user1HasWhatsApp) {
        expect(user1Phones.length).toBeGreaterThan(0);
      }

      // User 2 may or may not have WhatsApp
      const user2HasWhatsApp = seedUser2.agentHirings.some((h) =>
        h.channels.some((c) => (c.credentials as any)?.phoneNumberId),
      );
      if (!user2HasWhatsApp) {
        expect(user2Phones.length).toBe(0);
      }
    });
  });
});
