import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, HttpException } from '@nestjs/common';
import { LlmProvider } from '@domain/llm/provider.enum';
import { AgentService } from '@agent/agent.service';
import { AgentContextService } from '@agent/agent-context.service';
import { ClientRepository } from '@persistence/repositories/client.repository';
import {
  ClientCatalogItemBulkChunkError,
  ClientCatalogItemRepository,
} from '@persistence/repositories/client-catalog-item.repository';
import { ClientCatalogItemsService } from './client-catalog-items.service';

describe('ClientCatalogItemsService', () => {
  let service: ClientCatalogItemsService;
  let catalogRepo: jest.Mocked<
    Pick<ClientCatalogItemRepository, 'bulkUpsertChunked'>
  >;
  let clientRepo: jest.Mocked<Pick<ClientRepository, 'findById'>>;
  let agentService: jest.Mocked<
    Pick<AgentService, 'extractCatalogImportBatch'>
  >;
  let agentContext: jest.Mocked<
    Pick<AgentContextService, 'resolveEffectiveLlmConfigForClientId'>
  >;

  const clientId = '507f1f77bcf86cd799439011';

  const llmConfig = {
    provider: LlmProvider.OpenAI,
    apiKey: 'sk-test',
    model: 'gpt-4o',
  };

  const csvFile = (body: string): Express.Multer.File =>
    ({
      buffer: Buffer.from(body, 'utf8'),
      mimetype: 'text/csv',
      size: Buffer.byteLength(body, 'utf8'),
      originalname: 't.csv',
    } as Express.Multer.File);

  beforeEach(async () => {
    catalogRepo = { bulkUpsertChunked: jest.fn().mockResolvedValue(undefined) };
    clientRepo = { findById: jest.fn().mockResolvedValue({ _id: clientId }) };
    agentService = { extractCatalogImportBatch: jest.fn() };
    agentContext = {
      resolveEffectiveLlmConfigForClientId: jest
        .fn()
        .mockResolvedValue(llmConfig),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientCatalogItemsService,
        { provide: ClientCatalogItemRepository, useValue: catalogRepo },
        { provide: ClientRepository, useValue: clientRepo },
        { provide: AgentService, useValue: agentService },
        { provide: AgentContextService, useValue: agentContext },
      ],
    }).compile();

    service = module.get(ClientCatalogItemsService);
  });

  it('maps ClientCatalogItemBulkChunkError to 502 with committedChunks', async () => {
    agentService.extractCatalogImportBatch.mockResolvedValue([
      { sku: '1', name: 'One', type: 'product' },
    ]);
    catalogRepo.bulkUpsertChunked.mockRejectedValue(
      new ClientCatalogItemBulkChunkError('fail', 2, new Error('db')),
    );
    try {
      await service.importFromUpload(
        clientId,
        csvFile('sku,name,type\n1,One,product'),
      );
      throw new Error('expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(502);
      expect((e as HttpException).getResponse()).toMatchObject({
        code: 'CATALOG_IMPORT_DB_CHUNK_FAILED',
        committedChunks: 2,
      });
    }
  });

  it('rejects CATALOG_IMPORT_SKU_CONFLICT when one batch has diverging rows for same SKU', async () => {
    agentService.extractCatalogImportBatch.mockResolvedValue([
      { sku: 'A', name: 'x', type: 'product' },
      { sku: 'A', name: 'y', type: 'product' },
    ]);
    try {
      await service.importFromUpload(
        clientId,
        csvFile('sku,name,type\nA,x,product'),
      );
      throw new Error('expected BadRequestException');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const body = (e as BadRequestException).getResponse() as {
        code?: string;
      };
      expect(body.code).toBe('CATALOG_IMPORT_SKU_CONFLICT');
    }
  });

  it('rejects CATALOG_IMPORT_LLM_ROW_INVALID when model row fails Zod', async () => {
    agentService.extractCatalogImportBatch.mockResolvedValue([
      { sku: 'B', name: 'n', type: 'not-a-type' },
    ] as unknown as Awaited<
      ReturnType<AgentService['extractCatalogImportBatch']>
    >);
    try {
      await service.importFromUpload(
        clientId,
        csvFile('sku,name,type\nB,n,product'),
      );
      throw new Error('expected BadRequestException');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const body = (e as BadRequestException).getResponse() as {
        code?: string;
      };
      expect(body.code).toBe('CATALOG_IMPORT_LLM_ROW_INVALID');
    }
  });
});
