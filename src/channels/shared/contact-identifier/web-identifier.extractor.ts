import { Injectable } from '@nestjs/common';
import { CHANNEL_TYPES } from '@channels/shared/channel-type.constants';
import { ChannelType } from '@channels/shared/channel-type.type';
import {
  ContactIdentifierType,
  RawCapableContactIdentifierExtractor,
} from './contact-identifier-extractor.interface';

@Injectable()
export class WebIdentifierExtractor
  implements RawCapableContactIdentifierExtractor
{
  supports(channelType: ChannelType): boolean {
    return channelType === CHANNEL_TYPES.WEB;
  }

  extractRaw(payload: unknown): string {
    const source = payload as any;
    const rawEmail =
      source?.email ?? source?.contact?.email ?? source?.user?.email;

    if (typeof rawEmail !== 'string') {
      throw new Error('missing-web-identifier');
    }

    return rawEmail;
  }

  extract(payload: unknown): string {
    return this.extractRaw(payload).trim().toLowerCase();
  }

  getIdentifierType(): ContactIdentifierType {
    return 'email';
  }
}
