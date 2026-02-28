import { Injectable, Logger } from '@nestjs/common';
import { CHANNEL_TYPES } from '../channel-type.constants';
import { ChannelType } from '../channel-type.type';
import {
  ContactIdentifierType,
  RawCapableContactIdentifierExtractor,
} from './contact-identifier-extractor.interface';
import { InvalidIdentifierException } from './contact-identifier.exceptions';

@Injectable()
export class WhatsappIdentifierExtractor
  implements RawCapableContactIdentifierExtractor
{
  private readonly logger = new Logger(WhatsappIdentifierExtractor.name);

  supports(channelType: ChannelType): boolean {
    return channelType === CHANNEL_TYPES.WHATSAPP;
  }

  extractRaw(payload: unknown): string {
    const source = payload as any;
    const from =
      source?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from ?? source?.from;

    if (typeof from !== 'string') {
      this.logger.warn(
        'event=contact_identifier_validation_failed channelType=whatsapp reason=missing_identifier',
      );
      throw new InvalidIdentifierException('missing-whatsapp-identifier');
    }

    return from;
  }

  extract(payload: unknown): string {
    const raw = this.extractRaw(payload);
    const normalized = raw.replace(/\s+/g, '').replace(/[^\d]/g, '').trim();

    if (!normalized) {
      this.logger.warn(
        'event=contact_identifier_validation_failed channelType=whatsapp reason=empty_after_normalization',
      );
      throw new InvalidIdentifierException('empty-whatsapp-identifier');
    }

    if (!/^\d+$/.test(normalized)) {
      this.logger.warn(
        'event=contact_identifier_validation_failed channelType=whatsapp reason=non_digit_characters',
      );
      throw new InvalidIdentifierException('non-digit-whatsapp-identifier');
    }

    if (normalized.length < 8 || normalized.length > 15) {
      this.logger.warn(
        `event=contact_identifier_validation_failed channelType=whatsapp reason=invalid_length length=${normalized.length}`,
      );
      throw new InvalidIdentifierException('invalid-whatsapp-identifier-length');
    }

    return normalized;
  }

  getIdentifierType(): ContactIdentifierType {
    return 'phone';
  }
}
