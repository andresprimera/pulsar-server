import { ChannelType } from '@domain/channels/channel-type.type';

export const CONTACT_IDENTIFIER_EXTRACTORS = Symbol(
  'CONTACT_IDENTIFIER_EXTRACTORS',
);

export type ContactIdentifierType =
  | 'phone'
  | 'username'
  | 'platform_id'
  | 'email';

export interface ContactIdentifierExtractor {
  supports(channelType: ChannelType): boolean;
  extract(payload: unknown): string;
}

export interface RawCapableContactIdentifierExtractor
  extends ContactIdentifierExtractor {
  extractRaw(payload: unknown): string;
  getIdentifierType(): ContactIdentifierType;
}

export interface ExtractedContactIdentifier {
  externalId: string;
  externalIdRaw?: string;
  identifierType: ContactIdentifierType;
}
