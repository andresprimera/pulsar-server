import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { loginAsTestAdmin, AdminTestAuth } from './helpers/admin-test-auth';

describe('Agents CRUD (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let createdAgentId: string;
  let adminAuth: AdminTestAuth;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());

    adminAuth = await loginAsTestAdmin(app, connection);
  });

  afterAll(async () => {
    // Clean up test agents
    if (connection) {
      await connection.collection('agents').deleteMany({
        name: { $regex: /^E2E Test/ },
      });
    }
    await adminAuth.cleanup();
    await app.close();
  });

  describe('POST /agents', () => {
    it('should create a new agent with status=active', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .set('Cookie', adminAuth.cookie)
        .send({
          name: 'E2E Test Agent',
          systemPrompt: 'You are a test assistant.',
          kind: 'customer_service',
        })
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.name).toBe('E2E Test Agent');
      expect(response.body.systemPrompt).toBe('You are a test assistant.');
      expect(response.body.status).toBe('active');
      expect(response.body.kind).toBe('customer_service');

      createdAgentId = response.body._id;
    });

    it('should reject invalid payload (missing name)', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .set('Cookie', adminAuth.cookie)
        .send({
          systemPrompt: 'You are a test assistant.',
          kind: 'customer_service',
        })
        .expect(400);

      expect(response.body.message).toContain('name must be a string');
    });

    it('should reject invalid payload (missing systemPrompt)', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .set('Cookie', adminAuth.cookie)
        .send({
          name: 'Test',
          kind: 'customer_service',
        })
        .expect(400);

      expect(response.body.message).toContain('systemPrompt must be a string');
    });

    it('should reject invalid payload (missing kind)', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .set('Cookie', adminAuth.cookie)
        .send({
          name: 'NoKind',
          systemPrompt: 'Should be rejected.',
        })
        .expect(400);

      expect(response.body.message.join(' ')).toContain('kind');
    });

    it('should reject invalid kind value', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .set('Cookie', adminAuth.cookie)
        .send({
          name: 'BadKind',
          systemPrompt: 'Should be rejected.',
          kind: 'marketing',
        })
        .expect(400);

      expect(response.body.message.join(' ')).toContain('kind');
    });
  });

  describe('GET /agents', () => {
    it('should return all agents', async () => {
      const response = await request(app.getHttpServer())
        .get('/agents')
        .set('Cookie', adminAuth.cookie)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should filter agents by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/agents')
        .set('Cookie', adminAuth.cookie)
        .query({ status: 'active' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((agent: any) => {
        expect(agent.status).toBe('active');
      });
    });
  });

  describe('GET /agents/available', () => {
    it('should return only active agents', async () => {
      const response = await request(app.getHttpServer())
        .get('/agents/available')
        .set('Cookie', adminAuth.cookie)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((agent: any) => {
        expect(agent.status).toBe('active');
      });
    });
  });

  describe('GET /agents/:id', () => {
    it('should return agent by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/agents/${createdAgentId}`)
        .set('Cookie', adminAuth.cookie)
        .expect(200);

      expect(response.body._id).toBe(createdAgentId);
      expect(response.body.name).toBe('E2E Test Agent');
    });

    it('should return 404 for non-existent ID', async () => {
      await request(app.getHttpServer())
        .get('/agents/507f1f77bcf86cd799439011')
        .set('Cookie', adminAuth.cookie)
        .expect(404);
    });
  });

  describe('PATCH /agents/:id', () => {
    it('should update agent fields', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}`)
        .set('Cookie', adminAuth.cookie)
        .send({
          name: 'E2E Test Agent Updated',
          kind: 'customer_service',
        })
        .expect(200);

      expect(response.body.name).toBe('E2E Test Agent Updated');
      expect(response.body.systemPrompt).toBe('You are a test assistant.');
    });

    it('should reject PATCH that omits kind (kind is REQUIRED on update)', async () => {
      await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}`)
        .set('Cookie', adminAuth.cookie)
        .send({ name: 'Updated Without Kind' })
        .expect(400);
    });

    it('should return 404 for non-existent ID', async () => {
      await request(app.getHttpServer())
        .patch('/agents/507f1f77bcf86cd799439011')
        .set('Cookie', adminAuth.cookie)
        .send({ name: 'Updated', kind: 'customer_service' })
        .expect(404);
    });
  });

  describe('PATCH /agents/:id/status', () => {
    it('should update agent status to inactive', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}/status`)
        .set('Cookie', adminAuth.cookie)
        .send({ status: 'inactive' })
        .expect(200);

      expect(response.body.status).toBe('inactive');
    });

    it('should update agent status back to active', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}/status`)
        .set('Cookie', adminAuth.cookie)
        .send({ status: 'active' })
        .expect(200);

      expect(response.body.status).toBe('active');
    });

    it('should reject invalid status value', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}/status`)
        .set('Cookie', adminAuth.cookie)
        .send({ status: 'deleted' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('status must be one of'),
        ]),
      );
    });

    it('should return 404 for non-existent ID', async () => {
      await request(app.getHttpServer())
        .patch('/agents/507f1f77bcf86cd799439011/status')
        .set('Cookie', adminAuth.cookie)
        .send({ status: 'inactive' })
        .expect(404);
    });
  });

  describe('Archived agent immutability', () => {
    let archivedAgentId: string;

    beforeAll(async () => {
      // Create a new agent specifically for archive tests
      const createResponse = await request(app.getHttpServer())
        .post('/agents')
        .set('Cookie', adminAuth.cookie)
        .send({
          name: 'E2E Test Agent To Archive',
          systemPrompt: 'Will be archived.',
          kind: 'customer_service',
        });

      archivedAgentId = createResponse.body._id;

      // Archive it
      await request(app.getHttpServer())
        .patch(`/agents/${archivedAgentId}/status`)
        .set('Cookie', adminAuth.cookie)
        .send({ status: 'archived' });
    });

    it('should not allow updating archived agent fields', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${archivedAgentId}`)
        .set('Cookie', adminAuth.cookie)
        .send({ name: 'Should Not Update', kind: 'customer_service' })
        .expect(400);

      expect(response.body.message).toBe('Archived agents cannot be modified');
    });

    it('should not allow changing archived agent status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${archivedAgentId}/status`)
        .set('Cookie', adminAuth.cookie)
        .send({ status: 'active' })
        .expect(400);

      expect(response.body.message).toBe('Archived agents cannot be modified');
    });

    it('archived agent should still be readable', async () => {
      const response = await request(app.getHttpServer())
        .get(`/agents/${archivedAgentId}`)
        .set('Cookie', adminAuth.cookie)
        .expect(200);

      expect(response.body.status).toBe('archived');
    });

    it('archived agent should not appear in available list', async () => {
      const response = await request(app.getHttpServer())
        .get('/agents/available')
        .set('Cookie', adminAuth.cookie)
        .expect(200);

      const archivedAgent = response.body.find(
        (a: any) => a._id === archivedAgentId,
      );
      expect(archivedAgent).toBeUndefined();
    });
  });
});
