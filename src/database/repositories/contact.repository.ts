import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Contact } from '../schemas/contact.schema';

@Injectable()
export class ContactRepository {
  constructor(
    @InjectModel(Contact.name)
    private readonly model: Model<Contact>,
  ) {}

  async findById(id: string): Promise<Contact | null> {
    return this.model.findById(id).exec();
  }

  async findByClient(clientId: Types.ObjectId): Promise<Contact[]> {
    return this.model.find({ clientId }).exec();
  }

  async findByExternalUserId(
    externalUserId: string,
    clientId: Types.ObjectId,
  ): Promise<Contact | null> {
    return this.model.findOne({ externalUserId, clientId }).exec();
  }

  async findOrCreate(
    externalUserId: string,
    clientId: Types.ObjectId,
    channelType: 'whatsapp' | 'tiktok' | 'instagram',
    name: string,
    session?: ClientSession,
  ): Promise<Contact> {
    const existing = await this.model
      .findOne({ externalUserId, clientId })
      .session(session)
      .exec();

    if (existing) {
      return existing;
    }

    const [contact] = await this.model.create(
      [
        {
          externalUserId,
          clientId,
          channelType,
          name,
          status: 'active',
        },
      ],
      { session },
    );

    return contact;
  }
}
