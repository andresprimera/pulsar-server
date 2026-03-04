import { Injectable } from '@nestjs/common';

@Injectable()
export class MetadataExposureService {
  private static readonly ALLOWED_KEYS = [
    'firstName',
    'lastName',
    'language',
    'timezone',
    'tags',
  ] as const;

  extractSafeMetadata(metadata: Record<string, any> = {}): Record<string, any> {
    const safeMetadata: Record<string, any> = {};

    for (const key of MetadataExposureService.ALLOWED_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(metadata, key)) {
        continue;
      }

      const value = metadata[key];
      if (value === null || value === undefined) {
        continue;
      }

      if (key === 'tags') {
        if (Array.isArray(value)) {
          safeMetadata.tags = value.filter((tag) => typeof tag === 'string');
        }
        continue;
      }

      if (typeof value === 'string') {
        safeMetadata[key] = value;
      }
    }

    return safeMetadata;
  }
}
