import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillingRecord } from '@persistence/schemas/billing-record.schema';

@Injectable()
export class BillingRecordRepository {
  constructor(
    @InjectModel(BillingRecord.name)
    private readonly model: Model<BillingRecord>,
  ) {}

  async create(data: Partial<BillingRecord>): Promise<BillingRecord> {
    const [doc] = await this.model.create([data]);
    return doc;
  }

  async findByClient(clientId: Types.ObjectId): Promise<BillingRecord[]> {
    return this.model.find({ clientId }).sort({ periodStart: -1 }).exec();
  }

  async findByClientAndPeriod(
    clientId: Types.ObjectId,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BillingRecord | null> {
    return this.model.findOne({ clientId, periodStart, periodEnd }).exec();
  }

  async updateStatus(
    id: Types.ObjectId,
    status: 'paid' | 'void',
  ): Promise<BillingRecord | null> {
    return this.model.findByIdAndUpdate(id, { status }, { new: true }).exec();
  }
}
