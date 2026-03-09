import { Test, TestingModule } from '@nestjs/testing';
import { ChannelEnvService } from './channel-env.service';
import { ChannelEnvValidator } from './channel-env.validator';

describe('ChannelEnvValidator', () => {
  let validator: ChannelEnvValidator;
  let channelEnvService: ChannelEnvService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelEnvValidator,
        {
          provide: ChannelEnvService,
          useValue: {
            hasAnyWhatsAppMetaEnv: jest.fn(),
            getWhatsAppMetaCredentials: jest.fn(),
            hasAnyWhatsApp360Env: jest.fn(),
            getWhatsApp360Credentials: jest.fn(),
            hasAnyInstagramEnv: jest.fn(),
            getInstagramCredentials: jest.fn(),
            hasAnyTikTokEnv: jest.fn(),
            getTikTokCredentials: jest.fn(),
          },
        },
      ],
    }).compile();
    validator = module.get(ChannelEnvValidator);
    channelEnvService = module.get(ChannelEnvService);
  });

  it('does not throw when no env is set', () => {
    jest.mocked(channelEnvService.hasAnyWhatsAppMetaEnv).mockReturnValue(false);
    jest.mocked(channelEnvService.hasAnyWhatsApp360Env).mockReturnValue(false);
    jest.mocked(channelEnvService.hasAnyInstagramEnv).mockReturnValue(false);
    jest.mocked(channelEnvService.hasAnyTikTokEnv).mockReturnValue(false);
    expect(() => validator.onModuleInit()).not.toThrow();
  });

  it('throws when WhatsApp Meta env is set but credentials invalid', () => {
    jest.mocked(channelEnvService.hasAnyWhatsAppMetaEnv).mockReturnValue(true);
    jest
      .mocked(channelEnvService.getWhatsAppMetaCredentials)
      .mockReturnValue(undefined);
    jest.mocked(channelEnvService.hasAnyWhatsApp360Env).mockReturnValue(false);
    jest.mocked(channelEnvService.hasAnyInstagramEnv).mockReturnValue(false);
    jest.mocked(channelEnvService.hasAnyTikTokEnv).mockReturnValue(false);
    expect(() => validator.onModuleInit()).toThrow(
      /WHATSAPP_META_ACCESS_TOKEN/,
    );
  });

  it('does not throw when WhatsApp Meta env is set and valid', () => {
    jest.mocked(channelEnvService.hasAnyWhatsAppMetaEnv).mockReturnValue(true);
    jest.mocked(channelEnvService.getWhatsAppMetaCredentials).mockReturnValue({
      accessToken: 't',
    });
    jest.mocked(channelEnvService.hasAnyWhatsApp360Env).mockReturnValue(false);
    jest.mocked(channelEnvService.hasAnyInstagramEnv).mockReturnValue(false);
    jest.mocked(channelEnvService.hasAnyTikTokEnv).mockReturnValue(false);
    expect(() => validator.onModuleInit()).not.toThrow();
  });
});
