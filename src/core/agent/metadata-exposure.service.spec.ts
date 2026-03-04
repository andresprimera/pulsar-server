import { MetadataExposureService } from './metadata-exposure.service';

describe('MetadataExposureService', () => {
  let service: MetadataExposureService;

  beforeEach(() => {
    service = new MetadataExposureService();
  });

  it('returns only allowlisted safe metadata keys for LLM usage', () => {
    const safe = service.extractSafeMetadata({
      firstName: 'Jane',
      lastName: 'Doe',
      language: 'en',
      timezone: 'America/New_York',
      tags: ['vip', 'lead', 42, { nested: true }],
      accessToken: 'secret',
      rawPayload: { webhook: 'payload' },
      providerCredentials: { apiKey: 'x' },
    });

    expect(safe).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
      language: 'en',
      timezone: 'America/New_York',
      tags: ['vip', 'lead'],
    });
  });

  it('drops non-string scalar values and nested objects from allowlisted keys', () => {
    const safe = service.extractSafeMetadata({
      firstName: { value: 'Jane' },
      lastName: null,
      language: 123,
      timezone: 'UTC',
      tags: 'vip',
    });

    expect(safe).toEqual({
      timezone: 'UTC',
    });
  });
});
