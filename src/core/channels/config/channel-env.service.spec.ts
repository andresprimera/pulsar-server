import { Test, TestingModule } from '@nestjs/testing';
import { ChannelEnvService } from './channel-env.service';

describe('ChannelEnvService', () => {
  let service: ChannelEnvService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelEnvService],
    }).compile();
    service = module.get(ChannelEnvService);
  });

  afterEach(() => {
    delete process.env.WHATSAPP_META_ACCESS_TOKEN;
    delete process.env.WHATSAPP_DIALOG360_API_KEY;
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    delete process.env.TIKTOK_ACCESS_TOKEN;
  });

  describe('getWhatsAppMetaCredentials', () => {
    it('returns undefined when env var is missing', () => {
      expect(service.getWhatsAppMetaCredentials()).toBeUndefined();
    });

    it('returns only accessToken when set (no routing id from env)', () => {
      process.env.WHATSAPP_META_ACCESS_TOKEN = '  token  ';
      expect(service.getWhatsAppMetaCredentials()).toEqual({
        accessToken: 'token',
      });
    });
  });

  describe('getWhatsApp360Credentials', () => {
    it('returns undefined when env var is missing', () => {
      expect(service.getWhatsApp360Credentials()).toBeUndefined();
    });

    it('returns only apiKey when set (no routing id from env)', () => {
      process.env.WHATSAPP_DIALOG360_API_KEY = 'key360';
      expect(service.getWhatsApp360Credentials()).toEqual({
        apiKey: 'key360',
      });
    });
  });

  describe('getInstagramCredentials', () => {
    it('returns undefined when env var is missing', () => {
      expect(service.getInstagramCredentials()).toBeUndefined();
    });

    it('returns only accessToken when set (no account id from env)', () => {
      process.env.INSTAGRAM_ACCESS_TOKEN = 'ig-token';
      expect(service.getInstagramCredentials()).toEqual({
        accessToken: 'ig-token',
      });
    });
  });

  describe('getTikTokCredentials', () => {
    it('returns undefined when env var is missing', () => {
      expect(service.getTikTokCredentials()).toBeUndefined();
    });

    it('returns only accessToken when set (no user id from env)', () => {
      process.env.TIKTOK_ACCESS_TOKEN = 'tt-token';
      expect(service.getTikTokCredentials()).toEqual({
        accessToken: 'tt-token',
      });
    });
  });
});
