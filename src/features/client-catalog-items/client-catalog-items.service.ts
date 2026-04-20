import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { isValidCurrencyCode } from '@domain/billing/currency.validator';
import { ClientCatalogItemRepository } from '@persistence/repositories/client-catalog-item.repository';
import type { CatalogItemUpsertWrite } from '@persistence/repositories/client-catalog-item.repository';
import { ClientsService } from '@clients/clients.service';
import { CreateClientCatalogItemDto } from './dto/create-client-catalog-item.dto';
import { UpdateClientCatalogItemDto } from './dto/update-client-catalog-item.dto';
import type { ClientCatalogItemUpsertRowDto } from './dto/create-client-catalog-item.dto';
import { isMongoDuplicateKeyError } from '@shared/mongo-duplicate-key.util';

/** Matches {@link ClientCatalogItemRepository.updateByIdForClient} $set shape. */
type ClientCatalogItemClientUpdate = Partial<{
  name: string;
  description: string | null;
  type: 'product' | 'service';
  unitAmountMinor: number | null;
  currency: string | null;
  active: boolean;
  deactivatedAt: Date | null;
}>;

@Injectable()
export class ClientCatalogItemsService {
  constructor(
    private readonly catalogItemRepository: ClientCatalogItemRepository,
    private readonly clientsService: ClientsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private normalizeSku(raw: string): string {
    const sku = raw.trim();
    if (!sku) {
      throw new BadRequestException('sku is required');
    }
    return sku;
  }

  private async requireActiveClient(clientId: string) {
    const client = await this.clientsService.findById(clientId);
    if (!client || client.status !== 'active') {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  private assertMoneyPair(
    unitAmountMinor: number | undefined | null,
    currency: string | undefined | null,
    billingCurrency: string,
  ) {
    const hasAmount =
      unitAmountMinor !== undefined &&
      unitAmountMinor !== null &&
      Number.isInteger(unitAmountMinor as number);
    const hasCurrency =
      currency !== undefined &&
      currency !== null &&
      String(currency).trim().length > 0;

    if (!hasAmount && !hasCurrency) {
      return;
    }
    if (!hasAmount || !hasCurrency) {
      throw new BadRequestException(
        'unitAmountMinor and currency must both be set or both cleared',
      );
    }
    if (!Number.isInteger(unitAmountMinor as number)) {
      throw new BadRequestException('unitAmountMinor must be a JSON integer');
    }
    const c = String(currency).trim().toUpperCase();
    if (!isValidCurrencyCode(c)) {
      throw new BadRequestException('Invalid ISO 4217 currency code');
    }
    if (c !== billingCurrency) {
      throw new BadRequestException(
        `currency must match client billing currency ${billingCurrency}`,
      );
    }
  }

  async create(clientId: string, dto: CreateClientCatalogItemDto) {
    const client = await this.requireActiveClient(clientId);
    const sku = this.normalizeSku(dto.sku);
    this.assertMoneyPair(
      dto.unitAmountMinor,
      dto.currency,
      client.billingCurrency,
    );
    try {
      return await this.catalogItemRepository.create({
        clientId,
        sku,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        type: dto.type,
        unitAmountMinor: dto.unitAmountMinor,
        currency: dto.currency?.trim().toUpperCase(),
      });
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        throw new ConflictException('Duplicate sku for this client');
      }
      throw error;
    }
  }

  async findAllForClient(
    clientId: string,
    query: { page?: number; limit?: number; activeOnly?: boolean },
  ) {
    await this.requireActiveClient(clientId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const activeOnly = query.activeOnly ?? false;
    return this.catalogItemRepository.findByClientPaged(clientId, {
      page,
      limit,
      activeOnly,
    });
  }

  async findOne(clientId: string, catalogItemId: string) {
    await this.requireActiveClient(clientId);
    const doc = await this.catalogItemRepository.findByIdForClient(
      catalogItemId,
      clientId,
    );
    if (!doc) {
      throw new NotFoundException('Catalog item not found');
    }
    return doc;
  }

  async update(
    clientId: string,
    catalogItemId: string,
    dto: UpdateClientCatalogItemDto,
  ) {
    const client = await this.requireActiveClient(clientId);
    const existing = await this.catalogItemRepository.findByIdForClient(
      catalogItemId,
      clientId,
    );
    if (!existing) {
      throw new NotFoundException('Catalog item not found');
    }

    const nextUnit =
      dto.unitAmountMinor !== undefined
        ? dto.unitAmountMinor
        : existing.unitAmountMinor;
    const nextCurrency =
      dto.currency !== undefined && dto.currency !== null
        ? dto.currency
        : existing.currency;
    this.assertMoneyPair(nextUnit, nextCurrency, client.billingCurrency);

    const patch: ClientCatalogItemClientUpdate = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.description !== undefined) {
      patch.description =
        dto.description === null ? null : dto.description.trim();
    }
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.unitAmountMinor !== undefined) {
      patch.unitAmountMinor = dto.unitAmountMinor;
    }
    if (dto.currency !== undefined) {
      patch.currency =
        dto.currency === null
          ? null
          : String(dto.currency).trim().toUpperCase();
    }
    if (dto.active !== undefined) {
      patch.active = dto.active;
      patch.deactivatedAt = dto.active ? null : new Date();
    }

    const updated = await this.catalogItemRepository.updateByIdForClient(
      catalogItemId,
      clientId,
      patch,
    );
    if (!updated) {
      throw new NotFoundException('Catalog item not found');
    }
    return updated;
  }

  async softDelete(clientId: string, catalogItemId: string) {
    await this.requireActiveClient(clientId);
    const updated = await this.catalogItemRepository.updateByIdForClient(
      catalogItemId,
      clientId,
      {
        active: false,
        deactivatedAt: new Date(),
      },
    );
    if (!updated) {
      throw new NotFoundException('Catalog item not found');
    }
    return updated;
  }

  private rowToUpsertWrite(
    row: ClientCatalogItemUpsertRowDto,
    billingCurrency: string,
  ): CatalogItemUpsertWrite {
    const sku = this.normalizeSku(row.sku);
    this.assertMoneyPair(row.unitAmountMinor, row.currency, billingCurrency);
    return {
      sku,
      name: row.name.trim(),
      description: row.description?.trim(),
      type: row.type,
      unitAmountMinor: row.unitAmountMinor,
      currency: row.currency?.trim().toUpperCase(),
      active: true,
      deactivatedAt: null,
    };
  }

  private dedupeLastWins(rows: ClientCatalogItemUpsertRowDto[]) {
    const map = new Map<string, ClientCatalogItemUpsertRowDto>();
    for (let i = 0; i < rows.length; i += 1) {
      const sku = rows[i].sku.trim();
      if (!sku) {
        throw new BadRequestException(`items[${i}].sku is required`);
      }
      map.set(sku, rows[i]);
    }
    return Array.from(map.values());
  }

  async bulkUpsert(clientId: string, rows: ClientCatalogItemUpsertRowDto[]) {
    const client = await this.requireActiveClient(clientId);
    const deduped = this.dedupeLastWins(rows);
    const writes = deduped.map((r) =>
      this.rowToUpsertWrite(r, client.billingCurrency),
    );

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await this.catalogItemRepository.bulkUpsertForClient(
        clientId,
        writes,
        session,
      );
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }

    return { upserted: writes.length };
  }
}
