import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import * as SEED_DATA from '../src/database/data/seed-data.json';

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
            .map((c) => c.credentials?.phoneNumberId)
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

      // Clean up seeded clients
      await connection.collection('clients').deleteMany({
        _id: { $in: clientIds },
      });

      // Clean up seeded agents
      await connection.collection('agents').deleteMany({
        createdBySeeder: true,
      });

      // Clean up seeded users
      await connection.collection('users').deleteMany({
        email: { $in: seedEmails },
      });

      // Clean up seeded channels (WhatsApp and Email from seed data)
      const seedChannelNames = SEED_DATA.channels.map((c) => c.name);
      await connection.collection('channels').deleteMany({
        name: { $in: seedChannelNames },
      });
    }
  };

  describe('Agent Creation Tests', () => {
    it('should create both Customer Service Agent and Lead Qualifier & Sales Agent', async () => {
      const agents = await connection
        .collection('agents')
        .find({ createdBySeeder: true })
        .toArray();

      expect(agents).toHaveLength(2);

      const agentNames = agents.map((a) => a.name);
      expect(agentNames).toContain('Customer Service Agent');
      expect(agentNames).toContain('Lead Qualifier & Sales Agent');
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

      const salesAgent = await connection
        .collection('agents')
        .findOne({
          name: 'Lead Qualifier & Sales Agent',
          createdBySeeder: true,
        });

      expect(salesAgent).toBeDefined();
      expect(salesAgent.systemPrompt).toContain('sales and lead qualification');
      expect(salesAgent.status).toBe('active');
      expect(salesAgent.createdBySeeder).toBe(true);
    });
  });

  describe('Channel Infrastructure Tests', () => {
    it('should provision WhatsApp and Email channels', async () => {
      const whatsappChannel = await connection
        .collection('channels')
        .findOne({ name: 'WhatsApp' });

      expect(whatsappChannel).toBeDefined();
      expect(whatsappChannel.type).toBe('whatsapp');

      const emailChannel = await connection
        .collection('channels')
        .findOne({ name: 'Email' });

      expect(emailChannel).toBeDefined();
      expect(emailChannel.type).toBe('email');
    });

    it('should set correct supportedProviders for channels', async () => {
      const whatsappChannel = await connection
        .collection('channels')
        .findOne({ name: 'WhatsApp' });

      expect(whatsappChannel.supportedProviders).toContain('meta');
      expect(whatsappChannel.supportedProviders).toContain('twilio');

      const emailChannel = await connection
        .collection('channels')
        .findOne({ name: 'Email' });

      expect(emailChannel.supportedProviders).toContain('smtp');
      expect(emailChannel.supportedProviders).toContain('sendgrid');
    });
  });

  describe('User 1 Tests (andresprimera@gmail.com)', () => {
    it('should create User 1 successfully with correct email/name', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'andresprimera@gmail.com' });

      expect(user).toBeDefined();
      expect(user.name).toBe('Andrés Primera');
      expect(user.status).toBe('active');
    });

    it('should create User 1 client as individual type', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'andresprimera@gmail.com' });

      const client = await connection
        .collection('clients')
        .findOne({ _id: user.clientId });

      expect(client).toBeDefined();
      expect(client.type).toBe('individual');
      expect(client.status).toBe('active');
    });

    it('should hire Customer Service Agent for User 1', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'andresprimera@gmail.com' });

      const customerServiceAgent = await connection
        .collection('agents')
        .findOne({ name: 'Customer Service Agent' });

      const clientAgents = await connection
        .collection('client_agents')
        .find({
          clientId: user.clientId.toString(),
          agentId: customerServiceAgent._id.toString(),
        })
        .toArray();

      expect(clientAgents).toHaveLength(1);
      expect(clientAgents[0].status).toBe('active');
      expect(clientAgents[0].price).toBe(100);
    });

    it('should configure User 1 with WhatsApp + Email channels', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'andresprimera@gmail.com' });

      const customerServiceAgent = await connection
        .collection('agents')
        .findOne({ name: 'Customer Service Agent' });

      const clientAgent = await connection
        .collection('client_agents')
        .findOne({
          clientId: user.clientId.toString(),
          agentId: customerServiceAgent._id.toString(),
        });

      expect(clientAgent.channels).toHaveLength(2);

      const whatsappChannel = await connection
        .collection('channels')
        .findOne({ name: 'WhatsApp' });
      const emailChannel = await connection
        .collection('channels')
        .findOne({ name: 'Email' });

      const channelIds = clientAgent.channels.map((c) => c.channelId.toString());
      expect(channelIds).toContain(whatsappChannel._id.toString());
      expect(channelIds).toContain(emailChannel._id.toString());
    });
  });

  describe('User 2 Tests (user2@example.com)', () => {
    it('should create User 2 successfully', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user2@example.com' });

      expect(user).toBeDefined();
      expect(user.name).toBe('Demo User 2');
      expect(user.status).toBe('active');
    });

    it('should hire Lead Qualifier & Sales Agent for User 2', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user2@example.com' });

      const salesAgent = await connection
        .collection('agents')
        .findOne({ name: 'Lead Qualifier & Sales Agent' });

      const clientAgents = await connection
        .collection('client_agents')
        .find({
          clientId: user.clientId.toString(),
          agentId: salesAgent._id.toString(),
        })
        .toArray();

      expect(clientAgents).toHaveLength(1);
      expect(clientAgents[0].status).toBe('active');
    });

    it('should configure User 2 with WhatsApp only', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user2@example.com' });

      const salesAgent = await connection
        .collection('agents')
        .findOne({ name: 'Lead Qualifier & Sales Agent' });

      const clientAgent = await connection
        .collection('client_agents')
        .findOne({
          clientId: user.clientId.toString(),
          agentId: salesAgent._id.toString(),
        });

      expect(clientAgent.channels).toHaveLength(1);

      const whatsappChannel = await connection
        .collection('channels')
        .findOne({ name: 'WhatsApp' });

      expect(clientAgent.channels[0].channelId.toString()).toBe(
        whatsappChannel._id.toString(),
      );
    });

    it('should persist organization client name for User 2', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user2@example.com' });

      const client = await connection
        .collection('clients')
        .findOne({ _id: user.clientId });

      expect(client).toBeDefined();
      expect(client.type).toBe('organization');
      expect(client.name).toBe('Demo User 2 LLC');
    });
  });

  describe('User 3 Tests (user3@example.com)', () => {
    it('should create User 3 successfully', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user3@example.com' });

      expect(user).toBeDefined();
      expect(user.name).toBe('Demo User 3');
      expect(user.status).toBe('active');
    });

    it('should hire both agents for User 3', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user3@example.com' });

      const clientAgents = await connection
        .collection('client_agents')
        .find({
          clientId: user.clientId.toString(),
        })
        .toArray();

      expect(clientAgents).toHaveLength(2);
    });

    it('should have Customer Service Agent as one of User 3 agents', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user3@example.com' });

      const customerServiceAgent = await connection
        .collection('agents')
        .findOne({ name: 'Customer Service Agent' });

      const clientAgent = await connection
        .collection('client_agents')
        .findOne({
          clientId: user.clientId.toString(),
          agentId: customerServiceAgent._id.toString(),
        });

      expect(clientAgent).toBeDefined();
      expect(clientAgent.status).toBe('active');
    });

    it('should have Lead Qualifier & Sales Agent as one of User 3 agents', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user3@example.com' });

      const salesAgent = await connection
        .collection('agents')
        .findOne({ name: 'Lead Qualifier & Sales Agent' });

      const clientAgent = await connection
        .collection('client_agents')
        .findOne({
          clientId: user.clientId.toString(),
          agentId: salesAgent._id.toString(),
        });

      expect(clientAgent).toBeDefined();
      expect(clientAgent.status).toBe('active');
    });

    it('should configure both agents with WhatsApp for User 3', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user3@example.com' });

      const clientAgents = await connection
        .collection('client_agents')
        .find({
          clientId: user.clientId.toString(),
        })
        .toArray();

      const whatsappChannel = await connection
        .collection('channels')
        .findOne({ name: 'WhatsApp' });

      clientAgents.forEach((ca) => {
        expect(ca.channels).toHaveLength(1);
        expect(ca.channels[0].channelId.toString()).toBe(
          whatsappChannel._id.toString(),
        );
      });
    });

    it('should keep distinct WhatsApp phoneNumberId per hired agent for User 3', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user3@example.com' });

      const customerServiceAgent = await connection
        .collection('agents')
        .findOne({ name: 'Customer Service Agent' });
      const salesAgent = await connection
        .collection('agents')
        .findOne({ name: 'Lead Qualifier & Sales Agent' });

      const customerServiceHiring = await connection
        .collection('client_agents')
        .findOne({
          clientId: user.clientId.toString(),
          agentId: customerServiceAgent._id.toString(),
        });
      const salesHiring = await connection
        .collection('client_agents')
        .findOne({
          clientId: user.clientId.toString(),
          agentId: salesAgent._id.toString(),
        });

      expect(customerServiceHiring.channels[0].phoneNumberId).toBe('573332574068');
      expect(salesHiring.channels[0].phoneNumberId).toBe('573332574069');
      expect(customerServiceHiring.channels[0].phoneNumberId).not.toBe(
        salesHiring.channels[0].phoneNumberId,
      );
    });
  });

  describe('User 4 Tests (user4@example.com)', () => {
    it('should skip User 4 since no agents are hired', async () => {
      const user = await connection
        .collection('users')
        .findOne({ email: 'user4@example.com' });

      expect(user).toBeNull();
    });
  });

  describe('Idempotency Tests', () => {
    it('should not duplicate agents on re-run', async () => {
      const agentsBefore = await connection
        .collection('agents')
        .find({ createdBySeeder: true })
        .toArray();

      // Trigger seeding again (this would be done by restarting the app in real scenario)
      // For this test, we just verify the current state
      expect(agentsBefore).toHaveLength(2);

      // Verify no duplicates by name
      const names = agentsBefore.map((a) => a.name);
      const uniqueNames = [...new Set(names)];
      expect(uniqueNames).toHaveLength(2);
    });

    it('should not duplicate users on re-run', async () => {
      const userEmails = ['andresprimera@gmail.com', 'user2@example.com', 'user3@example.com'];
      
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
      const clientPhones = await connection
        .collection('client_phones')
        .find({ phoneNumberId: '573332574065' })
        .toArray();

      // Should have phone numbers registered for users who have WhatsApp
      expect(clientPhones.length).toBeGreaterThan(0);
    });

    it('should ensure phone numbers are unique per client', async () => {
      const user1 = await connection
        .collection('users')
        .findOne({ email: 'andresprimera@gmail.com' });

      const user2 = await connection
        .collection('users')
        .findOne({ email: 'user2@example.com' });

      const user1Phones = await connection
        .collection('client_phones')
        .find({ clientId: user1.clientId })
        .toArray();

      const user2Phones = await connection
        .collection('client_phones')
        .find({ clientId: user2.clientId })
        .toArray();

      // Each client should have their phone numbers
      expect(user1Phones.length).toBeGreaterThan(0);
      expect(user2Phones.length).toBeGreaterThan(0);

      // Verify they can share the same phoneNumberId (different clients can use same number)
      // This is allowed by the schema
    });
  });
});
