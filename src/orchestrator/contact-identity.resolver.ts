import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Contact } from '@persistence/schemas/contact.schema';
import { ContactRepository } from '@persistence/repositories/contact.repository';
import { ChannelType } from '@domain/channels/channel-type.type';
import {
  CONTACT_IDENTIFIER_REGISTRY,
  ContactIdentifierRegistry,
} from '@domain/channels/contact-identifier.interface';

export interface ResolveContactIdentityParams {
  channelType: ChannelType;
  payload: unknown;
  clientId: Types.ObjectId;
  channelId: Types.ObjectId;
  contactName: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ContactIdentityResolver {
  private readonly logger = new Logger(ContactIdentityResolver.name);

  constructor(
    @Inject(CONTACT_IDENTIFIER_REGISTRY)
    private readonly identifierExtractorRegistry: ContactIdentifierRegistry,
    private readonly contactRepository: ContactRepository,
  ) {}

  async resolveContact(params: ResolveContactIdentityParams): Promise<Contact> {
    const extractedIdentifier = this.identifierExtractorRegistry.resolve(
      params.channelType,
      params.payload,
    );

    const channelIdentifier = this.normalizeChannelIdentifier(
      extractedIdentifier.externalId,
    );

    return this.contactRepository.findOrCreateByExternalIdentity(
      params.clientId,
      params.channelId,
      channelIdentifier,
      extractedIdentifier.externalIdRaw,
      extractedIdentifier.identifierType,
      params.contactName,
      params.metadata,
    );
  }

  private normalizeChannelIdentifier(identifier: string): string {
    const normalized = identifier?.trim();
    if (!normalized) {
      throw new BadRequestException(
        'Identity must be resolved before message creation',
      );
    }

    this.logger.debug(`event=identity_normalized length=${normalized.length}`);
    return normalized;
  }
}
