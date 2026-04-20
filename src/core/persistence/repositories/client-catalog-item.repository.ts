import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ClientCatalogItem } from '@persistence/schemas/client-catalog-item.schema';

export interface CatalogItemUpsertWrite {
  sku: string;
  name: string;
  description?: string;
  type: 'product' | 'service';
  unitAmountMinor?: number;
  currency?: string;
  active: boolean;
  deactivatedAt?: Date | null;
}

@Injectable()
export class ClientCatalogItemRepository {
  constructor(
    @InjectModel(ClientCatalogItem.name)
    private readonly model: Model<ClientCatalogItem>,
  ) {}

  private toClientObjectId(clientId: string | Types.ObjectId): Types.ObjectId {
    return typeof clientId === 'string'
      ? new Types.ObjectId(clientId)
      : clientId;
  }

  async create(
    data: {
      clientId: Types.ObjectId | string;
      sku: string;
      name: string;
      description?: string;
      type: 'product' | 'service';
      unitAmountMinor?: number;
      currency?: string;
      active?: boolean;
    },
    session?: ClientSession,
  ): Promise<ClientCatalogItem> {
    const clientId = this.toClientObjectId(data.clientId);
    const opts = session ? { session } : {};
    const active = data.active ?? true;
    const [doc] = await this.model.create(
      [
        {
          clientId,
          sku: data.sku,
          name: data.name,
          description: data.description,
          type: data.type,
          unitAmountMinor: data.unitAmountMinor,
          currency: data.currency,
          active,
          deactivatedAt: active ? undefined : new Date(),
        },
      ],
      opts,
    );
    return doc;
  }

  async findByIdForClient(
    id: string,
    clientId: string,
  ): Promise<ClientCatalogItem | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(clientId)) {
      return null;
    }
    return this.model
      .findOne({
        _id: new Types.ObjectId(id),
        clientId: new Types.ObjectId(clientId),
      })
      .exec();
  }

  async findByClientPaged(
    clientId: string,
    opts: {
      page: number;
      limit: number;
      activeOnly: boolean;
    },
  ): Promise<{ items: ClientCatalogItem[]; total: number }> {
    const clientOid = this.toClientObjectId(clientId);
    const filter: Record<string, unknown> = { clientId: clientOid };
    if (opts.activeOnly) {
      filter.active = true;
    }
    const skip = (opts.page - 1) * opts.limit;
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ sku: 1, _id: 1 })
        .skip(skip)
        .limit(opts.limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async updateByIdForClient(
    id: string,
    clientId: string,
    patch: Partial<{
      name: string;
      description: string | null;
      type: 'product' | 'service';
      unitAmountMinor: number | null;
      currency: string | null;
      active: boolean;
      deactivatedAt: Date | null;
    }>,
    session?: ClientSession,
  ): Promise<ClientCatalogItem | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(clientId)) {
      return null;
    }
    const q = this.model.findOneAndUpdate(
      { _id: new Types.ObjectId(id), clientId: new Types.ObjectId(clientId) },
      { $set: patch },
      { new: true },
    );
    return (session ? q.session(session) : q).exec();
  }

  async bulkUpsertForClient(
    clientId: string,
    writes: CatalogItemUpsertWrite[],
    session?: ClientSession,
  ): Promise<void> {
    const clientOid = this.toClientObjectId(clientId);
    const ops = writes.map((w) => ({
      updateOne: {
        filter: { clientId: clientOid, sku: w.sku },
        update: {
          $set: {
            clientId: clientOid,
            sku: w.sku,
            name: w.name,
            description: w.description,
            type: w.type,
            unitAmountMinor: w.unitAmountMinor,
            currency: w.currency,
            active: w.active,
            deactivatedAt: w.deactivatedAt ?? undefined,
          },
        },
        upsert: true,
      },
    }));
    if (ops.length === 0) {
      return;
    }
    await this.model.bulkWrite(ops, {
      ordered: true,
      ...(session ? { session } : {}),
    });
  }
}
