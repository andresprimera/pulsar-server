import { Injectable, Logger } from '@nestjs/common';
import { ProcessedEventRepository } from '@persistence/repositories/processed-event.repository';

@Injectable()
export class EventIdempotencyService {
  private readonly logger = new Logger(EventIdempotencyService.name);

  constructor(
    private readonly processedEventRepository: ProcessedEventRepository,
  ) {}

  async registerIfFirst(params: {
    channel: string;
    messageId: string;
  }): Promise<boolean> {
    try {
      await this.processedEventRepository.create(
        params.channel,
        params.messageId,
      );
      return true;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        this.logger.debug(
          `Duplicate event skipped: channel=${params.channel} messageId=${params.messageId}`,
        );
        return false;
      }
      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as any).code === 11000
    );
  }
}
