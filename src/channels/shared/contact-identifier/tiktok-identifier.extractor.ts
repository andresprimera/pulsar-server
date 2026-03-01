import { Injectable } from '@nestjs/common';
import { CHANNEL_TYPES } from '@channels/shared/channel-type.constants';
import { ChannelType } from '@channels/shared/channel-type.type';
import {
  ContactIdentifierType,
  RawCapableContactIdentifierExtractor,
} from './contact-identifier-extractor.interface';

@Injectable()
export class TiktokIdentifierExtractor
  implements RawCapableContactIdentifierExtractor
{
  supports(channelType: ChannelType): boolean {
    return channelType === CHANNEL_TYPES.TIKTOK;
  }

  extractRaw(payload: unknown): string {
    const source = payload as any;
    const sender = source?.data?.sender?.user_id ?? source?.sender?.user_id;

    if (typeof sender !== 'string') {
      throw new Error('missing-tiktok-identifier');
    }

    return sender;
  }

  extract(payload: unknown): string {
    return this.extractRaw(payload).trim();
  }

  getIdentifierType(): ContactIdentifierType {
    return 'platform_id';
  }
}
