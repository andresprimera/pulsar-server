import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model, Types } from 'mongoose';
import { ClientCatalogItem } from '@persistence/schemas/client-catalog-item.schema';
import type { ClientCatalogItemUpsert } from '@shared/client-catalog-item.contract';
import { CATALOG_IMPORT_DB_CHUNK_SIZE } from '@shared/client-catalog-item.contract';

export class ClientCatalogItemBulkChunkError extends Error {
  constructor(
    message: string,
    readonly committedChunks: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ClientCatalogItemBulkChunkError';
  }
}

@Injectable()
export class ClientCatalogItemRepository {
  constructor(
    @InjectModel(ClientCatalogItem.name)
    private readonly model: Model<ClientCatalogItem>,
  ) {}

  async bulkUpsertChunked(
    clientId: string,
    items: ClientCatalogItemUpsert[],
  ): Promise<void> {
    const cid = new Types.ObjectId(clientId);
    const ops: AnyBulkWriteOperation<ClientCatalogItem>[] = items.map(
      (item) => ({
        updateOne: {
          filter: { clientId: cid, sku: item.sku },
          update: {
            $set: {
              clientId: cid,
              sku: item.sku,
              name: item.name,
              type: item.type,
              description: item.description,
              unitAmountMinor: item.unitAmountMinor,
              currency: item.currency,
              active: true,
              deactivatedAt: null,
            },
          },
          upsert: true,
        },
      }),
    );

    let committedChunks = 0;
    for (let i = 0; i < ops.length; i += CATALOG_IMPORT_DB_CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CATALOG_IMPORT_DB_CHUNK_SIZE);
      try {
        await this.model.bulkWrite(chunk, { ordered: true });
        committedChunks += 1;
      } catch (err) {
        throw new ClientCatalogItemBulkChunkError(
          'Catalog bulk upsert failed mid-chunk',
          committedChunks,
          err,
        );
      }
    }
  }

  async findActiveByClientId(clientId: string): Promise<ClientCatalogItem[]> {
    return this.model
      .find({
        clientId: new Types.ObjectId(clientId),
        active: true,
      })
      .exec();
  }

  async findOneForClient(
    clientId: string,
    catalogItemId: string,
  ): Promise<ClientCatalogItem | null> {
    return this.model
      .findOne({
        _id: new Types.ObjectId(catalogItemId),
        clientId: new Types.ObjectId(clientId),
      })
      .exec();
  }

  async createForClient(
    clientId: string,
    item: ClientCatalogItemUpsert,
  ): Promise<ClientCatalogItem> {
    const doc = await this.model.create({
      clientId: new Types.ObjectId(clientId),
      sku: item.sku,
      name: item.name,
      type: item.type,
      description: item.description,
      unitAmountMinor: item.unitAmountMinor,
      currency: item.currency,
      active: true,
    });
    return doc;
  }

  async softDeleteForClient(
    clientId: string,
    catalogItemId: string,
  ): Promise<ClientCatalogItem | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(catalogItemId),
          clientId: new Types.ObjectId(clientId),
        },
        { $set: { active: false, deactivatedAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  async updateForClient(
    clientId: string,
    catalogItemId: string,
    patch: Partial<ClientCatalogItemUpsert>,
  ): Promise<ClientCatalogItem | null> {
    const $set: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      $set.name = patch.name;
    }
    if (patch.description !== undefined) {
      $set.description = patch.description;
    }
    if (patch.type !== undefined) {
      $set.type = patch.type;
    }
    if (patch.unitAmountMinor !== undefined) {
      $set.unitAmountMinor = patch.unitAmountMinor;
    }
    if (patch.currency !== undefined) {
      $set.currency = patch.currency;
    }
    if (patch.sku !== undefined) {
      $set.sku = patch.sku;
    }
    if (Object.keys($set).length === 0) {
      return this.findOneForClient(clientId, catalogItemId);
    }
    return this.model
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(catalogItemId),
          clientId: new Types.ObjectId(clientId),
        },
        { $set },
        { new: true },
      )
      .exec();
  }
}
