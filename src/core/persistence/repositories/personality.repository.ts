import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Personality } from '@persistence/schemas/personality.schema';

@Injectable()
export class PersonalityRepository {
  constructor(
    @InjectModel(Personality.name)
    private readonly model: Model<Personality>,
  ) {}

  async findById(id: string): Promise<Personality | null> {
    return this.model.findById(id).exec();
  }

  async findActiveById(id: string): Promise<Personality | null> {
    return this.model.findOne({ _id: id, status: 'active' }).exec();
  }

  async findAll(): Promise<Personality[]> {
    return this.model.find().exec();
  }

  async findByStatus(
    status: 'active' | 'inactive' | 'archived',
  ): Promise<Personality[]> {
    return this.model.find({ status }).exec();
  }

  async create(data: Partial<Personality>): Promise<Personality> {
    return this.model.create(data);
  }

  async update(
    id: string,
    data: Partial<Personality>,
  ): Promise<Personality | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true }).exec();
  }
}
