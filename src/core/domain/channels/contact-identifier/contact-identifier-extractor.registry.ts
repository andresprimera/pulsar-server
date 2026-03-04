import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@domain/channels/channel-type.type';
import {
  CONTACT_IDENTIFIER_EXTRACTORS,
  ContactIdentifierExtractor,
  ExtractedContactIdentifier,
  RawCapableContactIdentifierExtractor,
} from './contact-identifier-extractor.interface';
import {
  ExtractorNotFoundException,
  InvalidIdentifierException,
} from './contact-identifier.exceptions';

@Injectable()
export class ContactIdentifierExtractorRegistry {
  private readonly logger = new Logger(ContactIdentifierExtractorRegistry.name);
  private readonly extractors: RawCapableContactIdentifierExtractor[];

  constructor(
    @Inject(CONTACT_IDENTIFIER_EXTRACTORS)
    extractors: RawCapableContactIdentifierExtractor[],
  ) {
    this.extractors = extractors;
  }

  resolve(
    channelType: ChannelType,
    payload: unknown,
  ): ExtractedContactIdentifier {
    const extractor = this.extractors.find((item) =>
      item.supports(channelType),
    );

    if (!extractor) {
      this.logger.error(
        `event=contact_identifier_extraction_failed reason=unsupported_channel channelType=${channelType}`,
      );
      throw new ExtractorNotFoundException(channelType);
    }

    let externalIdRaw: string;
    let externalId: string;

    try {
      externalIdRaw = extractor.extractRaw(payload);
      externalId = extractor.extract(payload);
    } catch (error) {
      if (error instanceof InvalidIdentifierException) {
        this.logger.error(
          `event=contact_identifier_extraction_failed reason=invalid_identifier channelType=${channelType}`,
        );
        throw error;
      }

      this.logger.error(
        `event=contact_identifier_extraction_failed reason=extractor_error channelType=${channelType} message=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new InvalidIdentifierException(
        'unable-to-extract-contact-identifier',
      );
    }

    const normalizedRaw = externalIdRaw.trim();
    const normalizedValue = externalId.trim();

    if (!normalizedRaw || !normalizedValue) {
      this.logger.warn(
        `event=contact_identifier_empty channelType=${channelType}`,
      );
      throw new InvalidIdentifierException('contact-identifier-empty');
    }

    if (normalizedRaw !== normalizedValue) {
      this.logger.log(
        `event=contact_identifier_normalized channelType=${channelType} rawLength=${normalizedRaw.length} normalizedLength=${normalizedValue.length}`,
      );
    }

    return {
      externalId: normalizedValue,
      externalIdRaw: normalizedRaw,
      identifierType: extractor.getIdentifierType(),
    };
  }

  getSupportedExtractors(): ContactIdentifierExtractor[] {
    return [...this.extractors];
  }
}
