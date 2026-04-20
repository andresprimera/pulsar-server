import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { isValidCurrencyCode } from '@domain/billing/currency.validator';
import { ClientSaleRepository } from '@persistence/repositories/client-sale.repository';
import { ClientCatalogItemRepository } from '@persistence/repositories/client-catalog-item.repository';
import { ClientsService } from '@clients/clients.service';
import { CreateClientSaleDto } from './dto/create-client-sale.dto';
import { UpdateClientSaleDto } from './dto/update-client-sale.dto';
import type { ClientSale } from '@persistence/schemas/client-sale.schema';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isMongoDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11000;
}

function parseOccurredAt(raw: string | number): Date {
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw)) {
      throw new BadRequestException(
        'occurredAt must be an integer epoch milliseconds value or ISO-8601 string',
      );
    }
    return new Date(raw);
  }
  if (typeof raw !== 'string') {
    throw new BadRequestException('occurredAt must be a string or number');
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('occurredAt is not a valid date');
  }
  return d;
}

function normalizeNotes(value?: string | null): string {
  return (value ?? '').trim();
}

@Injectable()
export class ClientSalesService {
  constructor(
    private readonly saleRepository: ClientSaleRepository,
    private readonly catalogItemRepository: ClientCatalogItemRepository,
    private readonly clientsService: ClientsService,
  ) {}

  private async requireActiveClient(clientId: string) {
    const client = await this.clientsService.findById(clientId);
    if (!client || client.status !== 'active') {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  private normalizeIdempotencyHeader(
    raw: string | string[] | undefined,
  ): string | undefined {
    if (raw === undefined || raw === null) {
      return undefined;
    }
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null) {
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Idempotency-Key cannot be empty');
    }
    return trimmed;
  }

  private assertMoney(
    currency: string,
    amountMinor: number,
    billingCurrency: string,
  ) {
    if (!Number.isInteger(amountMinor)) {
      throw new BadRequestException('amountMinor must be a JSON integer');
    }
    const c = currency.trim().toUpperCase();
    if (!isValidCurrencyCode(c)) {
      throw new BadRequestException('Invalid ISO 4217 currency code');
    }
    if (c !== billingCurrency) {
      throw new BadRequestException(
        `currency must match client billing currency ${billingCurrency}`,
      );
    }
  }

  private async assertCatalogItemOwned(
    clientId: string,
    catalogItemId?: string,
  ) {
    if (!catalogItemId) {
      return;
    }
    const item = await this.catalogItemRepository.findByIdForClient(
      catalogItemId,
      clientId,
    );
    if (!item) {
      throw new BadRequestException('catalogItemId not found for this client');
    }
  }

  private matchesIdempotentCreate(
    existing: ClientSale,
    dto: CreateClientSaleDto,
    occurredAt: Date,
  ): boolean {
    const existingCat = existing.catalogItemId
      ? String(existing.catalogItemId)
      : null;
    const dtoCat = dto.catalogItemId ?? null;
    if (existingCat !== dtoCat) {
      return false;
    }
    if (existing.title.trim() !== dto.title.trim()) {
      return false;
    }
    if (normalizeNotes(existing.notes) !== normalizeNotes(dto.notes)) {
      return false;
    }
    if (existing.status !== dto.status) {
      return false;
    }
    if (existing.amountMinor !== dto.amountMinor) {
      return false;
    }
    if (existing.currency.toUpperCase() !== dto.currency.trim().toUpperCase()) {
      return false;
    }
    if (existing.occurredAt.getTime() !== occurredAt.getTime()) {
      return false;
    }
    return true;
  }

  async create(
    clientId: string,
    dto: CreateClientSaleDto,
    idempotencyKeyHeader?: string | string[],
  ): Promise<{ statusCode: number; sale: ClientSale }> {
    const client = await this.requireActiveClient(clientId);
    const occurredAt = parseOccurredAt(dto.occurredAt);
    this.assertMoney(dto.currency, dto.amountMinor, client.billingCurrency);
    await this.assertCatalogItemOwned(clientId, dto.catalogItemId);

    const idempotencyKey =
      this.normalizeIdempotencyHeader(idempotencyKeyHeader);

    const payload = {
      clientId,
      catalogItemId: dto.catalogItemId,
      title: dto.title.trim(),
      notes: dto.notes?.trim(),
      status: dto.status,
      amountMinor: dto.amountMinor,
      currency: dto.currency.trim().toUpperCase(),
      occurredAt,
      idempotencyKey,
    };

    try {
      const sale = await this.saleRepository.create(payload);
      return { statusCode: 201, sale };
    } catch (error) {
      if (!idempotencyKey || !isMongoDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await this.saleRepository.findByClientAndIdempotencyKey(
        clientId,
        idempotencyKey,
      );
      if (!existing) {
        throw error;
      }
      if (!this.matchesIdempotentCreate(existing, dto, occurredAt)) {
        throw new ConflictException(
          'Idempotency-Key reused with a different payload',
        );
      }
      return { statusCode: 200, sale: existing };
    }
  }

  async findAllForClient(
    clientId: string,
    query: { page?: number; limit?: number },
  ) {
    await this.requireActiveClient(clientId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    return this.saleRepository.findByClientPaged(clientId, { page, limit });
  }

  async findOne(clientId: string, saleId: string) {
    await this.requireActiveClient(clientId);
    const doc = await this.saleRepository.findByIdForClient(saleId, clientId);
    if (!doc) {
      throw new NotFoundException('Sale not found');
    }
    return doc;
  }

  async update(clientId: string, saleId: string, dto: UpdateClientSaleDto) {
    const client = await this.requireActiveClient(clientId);
    const existing = await this.saleRepository.findByIdForClient(
      saleId,
      clientId,
    );
    if (!existing) {
      throw new NotFoundException('Sale not found');
    }

    const patch: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      patch.title = dto.title.trim();
    }
    if (dto.notes !== undefined) {
      patch.notes = dto.notes.trim();
    }
    if (dto.status !== undefined) {
      patch.status = dto.status;
    }
    if (dto.amountMinor !== undefined) {
      if (!Number.isInteger(dto.amountMinor)) {
        throw new BadRequestException('amountMinor must be a JSON integer');
      }
      patch.amountMinor = dto.amountMinor;
    }
    if (dto.occurredAt !== undefined) {
      patch.occurredAt = parseOccurredAt(dto.occurredAt);
    }
    if (dto.catalogItemId !== undefined) {
      if (dto.catalogItemId === null) {
        patch.catalogItemId = null;
      } else {
        await this.assertCatalogItemOwned(clientId, dto.catalogItemId);
        patch.catalogItemId = new Types.ObjectId(dto.catalogItemId);
      }
    }

    const nextAmount =
      dto.amountMinor !== undefined ? dto.amountMinor : existing.amountMinor;
    if (!Number.isInteger(nextAmount)) {
      throw new BadRequestException('amountMinor must be a JSON integer');
    }

    if (dto.amountMinor !== undefined) {
      this.assertMoney(existing.currency, nextAmount, client.billingCurrency);
    }

    const updated = await this.saleRepository.updateByIdForClient(
      saleId,
      clientId,
      patch as any,
    );
    if (!updated) {
      throw new NotFoundException('Sale not found');
    }
    return updated;
  }

  async remove(clientId: string, saleId: string): Promise<void> {
    await this.requireActiveClient(clientId);
    const ok = await this.saleRepository.deleteByIdForClient(saleId, clientId);
    if (!ok) {
      throw new NotFoundException('Sale not found');
    }
  }
}
