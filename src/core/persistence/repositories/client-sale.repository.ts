import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  ClientSale,
  ClientSaleStatus,
} from '@persistence/schemas/client-sale.schema';

@Injectable()
export class ClientSaleRepository {
  constructor(
    @InjectModel(ClientSale.name)
    private readonly model: Model<ClientSale>,
  ) {}

  private toClientObjectId(clientId: string | Types.ObjectId): Types.ObjectId {
    return typeof clientId === 'string'
      ? new Types.ObjectId(clientId)
      : clientId;
  }

  async create(
    data: {
      clientId: Types.ObjectId | string;
      catalogItemId?: Types.ObjectId | string;
      title: string;
      notes?: string;
      status: ClientSaleStatus;
      amountMinor: number;
      currency: string;
      occurredAt: Date;
      idempotencyKey?: string;
    },
    session?: ClientSession,
  ): Promise<ClientSale> {
    const clientId = this.toClientObjectId(data.clientId);
    const catalogItemId =
      data.catalogItemId === undefined || data.catalogItemId === null
        ? undefined
        : typeof data.catalogItemId === 'string'
        ? new Types.ObjectId(data.catalogItemId)
        : data.catalogItemId;
    const doc: Record<string, unknown> = {
      clientId,
      title: data.title,
      notes: data.notes,
      status: data.status,
      amountMinor: data.amountMinor,
      currency: data.currency,
      occurredAt: data.occurredAt,
    };
    if (catalogItemId) {
      doc.catalogItemId = catalogItemId;
    }
    if (data.idempotencyKey !== undefined && data.idempotencyKey !== null) {
      doc.idempotencyKey = data.idempotencyKey;
    }
    const opts = session ? { session } : {};
    const [created] = await this.model.create([doc], opts);
    return created;
  }

  async findByIdForClient(
    id: string,
    clientId: string,
  ): Promise<ClientSale | null> {
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

  async findByClientAndIdempotencyKey(
    clientId: string,
    idempotencyKey: string,
  ): Promise<ClientSale | null> {
    if (!Types.ObjectId.isValid(clientId)) {
      return null;
    }
    return this.model
      .findOne({
        clientId: new Types.ObjectId(clientId),
        idempotencyKey,
      })
      .exec();
  }

  async findByClientPaged(
    clientId: string,
    opts: { page: number; limit: number },
  ): Promise<{ items: ClientSale[]; total: number }> {
    const clientOid = this.toClientObjectId(clientId);
    const filter = { clientId: clientOid };
    const skip = (opts.page - 1) * opts.limit;
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ occurredAt: -1, _id: -1 })
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
      title: string;
      notes: string | null;
      status: ClientSaleStatus;
      occurredAt: Date;
      amountMinor: number;
      catalogItemId: Types.ObjectId | null | undefined;
    }>,
    session?: ClientSession,
  ): Promise<ClientSale | null> {
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

  async deleteByIdForClient(
    id: string,
    clientId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(clientId)) {
      return false;
    }
    const q = this.model.deleteOne({
      _id: new Types.ObjectId(id),
      clientId: new Types.ObjectId(clientId),
    });
    const res = await (session ? q.session(session) : q).exec();
    return res.deletedCount === 1;
  }
}
