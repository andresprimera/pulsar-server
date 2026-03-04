import { Injectable } from '@nestjs/common';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { ChannelType } from '@domain/channels/channel-type.type';
import {
  ContactIdentifierType,
  RawCapableContactIdentifierExtractor,
} from './contact-identifier-extractor.interface';
import { InvalidIdentifierException } from './contact-identifier.exceptions';

@Injectable()
export class InstagramIdentifierExtractor
  implements RawCapableContactIdentifierExtractor
{
  supports(channelType: ChannelType): boolean {
    return channelType === CHANNEL_TYPES.INSTAGRAM;
  }

  extractRaw(payload: unknown): string {
    const source = payload as any;
    const sender =
      source?.entry?.[0]?.messaging?.[0]?.sender?.id ?? source?.sender?.id;

    if (typeof sender !== 'string') {
      throw new InvalidIdentifierException('missing-instagram-identifier');
    }

    return sender;
  }

  extract(payload: unknown): string {
    const normalized = this.extractRaw(payload).trim().toLowerCase();
    if (!normalized) {
      throw new InvalidIdentifierException('empty-instagram-identifier');
    }

    return normalized;
  }

  getIdentifierType(): ContactIdentifierType {
    return 'platform_id';
  }
}
