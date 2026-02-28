import { Injectable } from '@nestjs/common';
import { CHANNEL_TYPES } from '../channel-type.constants';
import { ChannelType } from '../channel-type.type';
import {
  ContactIdentifierType,
  RawCapableContactIdentifierExtractor,
} from './contact-identifier-extractor.interface';

@Injectable()
export class ApiIdentifierExtractor
  implements RawCapableContactIdentifierExtractor
{
  supports(channelType: ChannelType): boolean {
    return channelType === CHANNEL_TYPES.API;
  }

  extractRaw(payload: unknown): string {
    const source = payload as any;
    const rawId = source?.externalId ?? source?.contactId ?? source?.senderId;

    if (typeof rawId !== 'string') {
      throw new Error('missing-api-identifier');
    }

    return rawId;
  }

  extract(payload: unknown): string {
    return this.extractRaw(payload).trim();
  }

  getIdentifierType(): ContactIdentifierType {
    return 'platform_id';
  }
}
