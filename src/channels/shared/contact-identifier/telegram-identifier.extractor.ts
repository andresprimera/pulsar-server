import { Injectable, Logger } from '@nestjs/common';
import { CHANNEL_TYPES } from '../channel-type.constants';
import { ChannelType } from '../channel-type.type';
import {
  ContactIdentifierType,
  RawCapableContactIdentifierExtractor,
} from './contact-identifier-extractor.interface';
import { InvalidIdentifierException } from './contact-identifier.exceptions';

@Injectable()
export class TelegramIdentifierExtractor
  implements RawCapableContactIdentifierExtractor
{
  private readonly logger = new Logger(TelegramIdentifierExtractor.name);

  supports(channelType: ChannelType): boolean {
    return channelType === CHANNEL_TYPES.TELEGRAM;
  }

  extractRaw(payload: unknown): string {
    const source = payload as any;
    const immutableId = source?.message?.from?.id ?? source?.from?.id;
    const username = source?.message?.from?.username ?? source?.from?.username;

    if (immutableId !== undefined && immutableId !== null) {
      return String(immutableId);
    }

    if (typeof username === 'string') {
      return username;
    }

    throw new InvalidIdentifierException('missing-telegram-identifier');
  }

  extract(payload: unknown): string {
    const source = payload as any;
    const rawImmutableId = source?.message?.from?.id ?? source?.from?.id;
    const rawUsername =
      source?.message?.from?.username ?? source?.from?.username;

    const hasImmutableId =
      rawImmutableId !== undefined && rawImmutableId !== null;
    const hasUsername = typeof rawUsername === 'string';

    if (!hasImmutableId && !hasUsername) {
      this.logger.warn(
        'event=contact_identifier_validation_failed channelType=telegram reason=missing_identifier',
      );
      throw new InvalidIdentifierException('empty-telegram-identifier');
    }

    let validatedImmutableId: string | null = null;
    if (hasImmutableId) {
      const immutableId = String(rawImmutableId);
      const isNumeric = /^\d+$/.test(immutableId);
      const hasValidLength =
        immutableId.length >= 5 && immutableId.length <= 20;

      if (!isNumeric || !hasValidLength) {
        this.logger.warn(
          `event=contact_identifier_validation_failed channelType=telegram reason=invalid_telegram_id idLength=${immutableId.length}`,
        );
        throw new InvalidIdentifierException('invalid-telegram-id');
      }

      validatedImmutableId = immutableId;
    }

    let validatedUsername: string | null = null;
    if (hasUsername) {
      const username = rawUsername.trim();
      const isValidUsername = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username);

      if (!isValidUsername) {
        this.logger.warn(
          `event=contact_identifier_validation_failed channelType=telegram reason=invalid_username usernameLength=${username.length}`,
        );
        throw new InvalidIdentifierException('invalid-telegram-username');
      }

      validatedUsername = username;
    }

    if (validatedImmutableId) {
      return validatedImmutableId;
    }

    if (validatedUsername) {
      return validatedUsername;
    }

    this.logger.warn(
      'event=contact_identifier_validation_failed channelType=telegram reason=no_valid_identifier',
    );
    throw new InvalidIdentifierException('no-valid-telegram-identifier');
  }

  getIdentifierType(): ContactIdentifierType {
    return 'platform_id';
  }
}
