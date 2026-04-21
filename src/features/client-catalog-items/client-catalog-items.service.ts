import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentService } from '@agent/agent.service';
import { AgentContextService } from '@agent/agent-context.service';
import { ClientRepository } from '@persistence/repositories/client.repository';
import {
  ClientCatalogItemBulkChunkError,
  ClientCatalogItemRepository,
} from '@persistence/repositories/client-catalog-item.repository';
import {
  clientCatalogItemUpsertSchema,
  normalizeCatalogSku,
  stableSerializeCatalogItem,
  type ClientCatalogItemUpsert,
} from '@shared/client-catalog-item.contract';
import { ZodError } from 'zod';
import { CreateClientCatalogItemDto } from './dto/create-client-catalog-item.dto';
import { UpdateClientCatalogItemDto } from './dto/update-client-catalog-item.dto';
import {
  buildLlmWorkUnitsFromExtract,
  extractCatalogFromUpload,
} from './catalog-import.extract';
import {
  CATALOG_IMPORT_ALLOWED_MIMES,
  CATALOG_IMPORT_MAX_FILE_BYTES,
} from './catalog-import.constants';

const CATALOG_IMPORT_DB_CHUNK_FAILED_MESSAGE =
  'Catalog upsert failed while writing to the database. Each successful chunk was committed atomically; the failing chunk was rolled back. Re-upload the full file to converge (SKU upserts are idempotent).';

@Injectable()
export class ClientCatalogItemsService {
  constructor(
    private readonly catalogItemRepository: ClientCatalogItemRepository,
    private readonly clientRepository: ClientRepository,
    private readonly agentService: AgentService,
    private readonly agentContextService: AgentContextService,
  ) {}

  async assertClientExists(clientId: string): Promise<void> {
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
  }

  async create(clientId: string, dto: CreateClientCatalogItemDto) {
    await this.assertClientExists(clientId);
    const parsed = clientCatalogItemUpsertSchema.parse(dto);
    return this.catalogItemRepository.createForClient(clientId, parsed);
  }

  async bulkUpsert(
    clientId: string,
    items: CreateClientCatalogItemDto[],
  ): Promise<{ upserted: number }> {
    await this.assertClientExists(clientId);
    const parsed = items.map((row) => clientCatalogItemUpsertSchema.parse(row));
    try {
      await this.catalogItemRepository.bulkUpsertChunked(clientId, parsed);
    } catch (err) {
      this.rethrowBulkChunkError(err);
    }
    return { upserted: parsed.length };
  }

  async findAllForClient(clientId: string) {
    await this.assertClientExists(clientId);
    return this.catalogItemRepository.findActiveByClientId(clientId);
  }

  async findOne(clientId: string, catalogItemId: string) {
    await this.assertClientExists(clientId);
    const doc = await this.catalogItemRepository.findOneForClient(
      clientId,
      catalogItemId,
    );
    if (!doc || !doc.active) {
      throw new NotFoundException('Catalog item not found');
    }
    return doc;
  }

  async update(
    clientId: string,
    catalogItemId: string,
    dto: UpdateClientCatalogItemDto,
  ) {
    await this.assertClientExists(clientId);
    const patch: Partial<ClientCatalogItemUpsert> = {};
    if (dto.sku !== undefined) {
      patch.sku = dto.sku;
    }
    if (dto.name !== undefined) {
      patch.name = dto.name;
    }
    if (dto.description !== undefined) {
      patch.description = dto.description;
    }
    if (dto.type !== undefined) {
      patch.type = dto.type;
    }
    if (dto.unitAmountMinor !== undefined) {
      patch.unitAmountMinor = dto.unitAmountMinor;
    }
    if (dto.currency !== undefined) {
      patch.currency = dto.currency?.toUpperCase();
    }
    if (
      patch.unitAmountMinor !== undefined &&
      patch.unitAmountMinor !== null &&
      !patch.currency
    ) {
      throw new BadRequestException(
        'currency is required when unitAmountMinor is set',
      );
    }
    const updated = await this.catalogItemRepository.updateForClient(
      clientId,
      catalogItemId,
      patch,
    );
    if (!updated || !updated.active) {
      throw new NotFoundException('Catalog item not found');
    }
    return updated;
  }

  async softDelete(clientId: string, catalogItemId: string) {
    await this.assertClientExists(clientId);
    const updated = await this.catalogItemRepository.softDeleteForClient(
      clientId,
      catalogItemId,
    );
    if (!updated) {
      throw new NotFoundException('Catalog item not found');
    }
    return updated;
  }

  async importFromUpload(clientId: string, file?: Express.Multer.File) {
    await this.assertClientExists(clientId);
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_FILE_REQUIRED',
        message: 'Multipart field "file" is required.',
      });
    }
    if (file.size > CATALOG_IMPORT_MAX_FILE_BYTES) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_FILE_TOO_LARGE',
        message: `File exceeds ${CATALOG_IMPORT_MAX_FILE_BYTES} bytes.`,
      });
    }
    const mime = (file.mimetype ?? '').toLowerCase();
    if (!CATALOG_IMPORT_ALLOWED_MIMES.has(mime)) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_UNSUPPORTED',
        message: `Unsupported MIME type: ${mime}`,
      });
    }

    const llmConfig =
      await this.agentContextService.resolveEffectiveLlmConfigForClientId(
        clientId,
      );
    if (!llmConfig?.apiKey?.trim()) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_LLM_UNAVAILABLE',
        message:
          'No LLM API key is available for this client (configure client LLM or OPENAI_API_KEY).',
      });
    }

    const extract = await extractCatalogFromUpload({
      buffer: file.buffer,
      mimeType: mime,
      originalname: file.originalname,
    });
    const workUnits = buildLlmWorkUnitsFromExtract(extract);

    const merged = new Map<string, ClientCatalogItemUpsert>();
    for (const unit of workUnits) {
      const batch = await this.agentService.extractCatalogImportBatch({
        llmConfig,
        userText: unit.userText,
        attachments: unit.attachments,
      });
      this.assertNoConflictingDuplicatesInBatch(batch);
      for (const raw of batch) {
        let parsed: ClientCatalogItemUpsert;
        try {
          parsed = clientCatalogItemUpsertSchema.parse(raw);
        } catch (e) {
          if (e instanceof ZodError) {
            throw new BadRequestException({
              code: 'CATALOG_IMPORT_LLM_ROW_INVALID',
              message:
                'The model returned a row that does not match the catalog schema.',
              issues: e.flatten(),
            });
          }
          throw e;
        }
        const key = normalizeCatalogSku(parsed.sku);
        merged.set(key, parsed);
      }
    }

    if (merged.size === 0) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_EMPTY',
        message: 'No catalog items could be produced from this file.',
      });
    }

    const list = [...merged.values()];
    try {
      await this.catalogItemRepository.bulkUpsertChunked(clientId, list);
    } catch (err) {
      if (err instanceof ClientCatalogItemBulkChunkError) {
        throw new HttpException(
          {
            code: 'CATALOG_IMPORT_DB_CHUNK_FAILED',
            message: CATALOG_IMPORT_DB_CHUNK_FAILED_MESSAGE,
            committedChunks: err.committedChunks,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
      this.rethrowBulkChunkError(err);
    }

    return { upserted: list.length };
  }

  private assertNoConflictingDuplicatesInBatch(
    items: ClientCatalogItemUpsert[],
  ): void {
    const bySku = new Map<string, ClientCatalogItemUpsert[]>();
    for (const item of items) {
      const key = normalizeCatalogSku(item.sku);
      const arr = bySku.get(key) ?? [];
      arr.push(item);
      bySku.set(key, arr);
    }
    for (const [, group] of bySku) {
      if (group.length < 2) {
        continue;
      }
      const first = stableSerializeCatalogItem(group[0]);
      for (let i = 1; i < group.length; i++) {
        if (stableSerializeCatalogItem(group[i]) !== first) {
          throw new BadRequestException({
            code: 'CATALOG_IMPORT_SKU_CONFLICT',
            message:
              'The model returned multiple different rows for the same SKU within one batch.',
          });
        }
      }
    }
  }

  private rethrowBulkChunkError(err: unknown): never {
    if (err instanceof ClientCatalogItemBulkChunkError) {
      throw new HttpException(
        {
          code: 'CATALOG_IMPORT_DB_CHUNK_FAILED',
          message: CATALOG_IMPORT_DB_CHUNK_FAILED_MESSAGE,
          committedChunks: err.committedChunks,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    throw err;
  }
}
