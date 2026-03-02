import { ChannelType } from './channel-type.type';

export const CONTACT_IDENTIFIER_REGISTRY = Symbol(
  'CONTACT_IDENTIFIER_REGISTRY',
);

export type ContactIdentifierType =
  | 'phone'
  | 'username'
  | 'platform_id'
  | 'email';

export interface ExtractedContactIdentifier {
  externalId: string;
  externalIdRaw?: string;
  identifierType: ContactIdentifierType;
}

export interface ContactIdentifierRegistry {
  resolve(
    channelType: ChannelType,
    payload: unknown,
  ): ExtractedContactIdentifier;
}
