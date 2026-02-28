import { BadRequestException } from '@nestjs/common';

export class InvalidIdentifierException extends BadRequestException {
  constructor(reason: string) {
    super(`Invalid identifier: ${reason}`);
  }
}

export class ExtractorNotFoundException extends BadRequestException {
  constructor(channelType: string) {
    super(`No contact identifier extractor for channel: ${channelType}`);
  }
}
