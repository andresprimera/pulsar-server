import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Contact } from '@database/schemas/contact.schema';
import { ContactIdentifierType } from '@database/schemas/contact.schema';

@Injectable()
export class ContactRepository {
  private readonly logger = new Logger(ContactRepository.name);

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

  async findByExternalIdentity(
    clientId: Types.ObjectId,
    channelId: Types.ObjectId,
    externalId: string,
  ): Promise<Contact | null> {
    return this.model.findOne({ clientId, channelId, externalId }).exec();
  }

  async findOrCreateByExternalIdentity(
    clientId: Types.ObjectId,
    channelId: Types.ObjectId,
    externalId: string,
    externalIdRaw: string | undefined,
    identifierType: ContactIdentifierType,
    name: string,
    metadata?: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<Contact> {
    const filter = { clientId, channelId, externalId };
    const setOnInsert = {
      clientId,
      channelId,
      externalId,
      externalIdRaw,
      identifier: {
        type: identifierType,
        value: externalId,
      },
      name,
      metadata: metadata ?? {},
      status: 'active',
    };

    try {
      const contact = await this.model
        .findOneAndUpdate(
          filter,
          {
            $setOnInsert: setOnInsert,
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true,
            session,
          },
        )
        .exec();

      this.logger.log(
        `event=contact_upsert_success clientId=${clientId.toString()} channelId=${channelId.toString()}`,
      );

      return contact as Contact;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        this.logger.warn(
          `event=contact_duplicate_key_retry clientId=${clientId.toString()} channelId=${channelId.toString()}`,
        );

        const existing = await this.model
          .findOne(filter)
          .session(session)
          .exec();
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as any).code === 11000
    );
  }
}
