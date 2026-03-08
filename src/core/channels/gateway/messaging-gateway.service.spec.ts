import { Logger } from '@nestjs/common';
import { MessagingGatewayService } from './messaging-gateway.service';
import { ChannelRouter } from '../channel-router';
import { ChannelAdapter } from '../channel-adapter.interface';

describe('MessagingGatewayService', () => {
  let gateway: MessagingGatewayService;
  let channelRouter: ChannelRouter;
  let mockAdapter: jest.Mocked<ChannelAdapter>;

  beforeEach(() => {
    mockAdapter = {
      channel: 'whatsapp',
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };

    channelRouter = {
      resolve: jest.fn().mockReturnValue(mockAdapter),
      hasChannel: jest.fn(),
    } as unknown as ChannelRouter;

    gateway = new MessagingGatewayService(channelRouter);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves the channel adapter and delegates sendMessage', async () => {
    await gateway.send({
      channel: 'whatsapp',
      to: '+1234567890',
      message: 'Hello',
      provider: 'meta',
      credentials: { accessToken: 'tok' },
    });

    expect(channelRouter.resolve).toHaveBeenCalledWith('whatsapp');
    expect(mockAdapter.sendMessage).toHaveBeenCalledWith({
      to: '+1234567890',
      message: 'Hello',
      provider: 'meta',
      credentials: { accessToken: 'tok' },
    });
  });

  it('throws when channel is not registered', async () => {
    (channelRouter.resolve as jest.Mock).mockImplementation(() => {
      throw new Error('No channel adapter registered for channel="sms"');
    });

    await expect(
      gateway.send({
        channel: 'sms',
        to: '+1234567890',
        message: 'Hello',
        credentials: {},
      }),
    ).rejects.toThrow('No channel adapter registered for channel="sms"');
  });

  it('propagates errors from the channel adapter', async () => {
    mockAdapter.sendMessage.mockRejectedValue(new Error('API failure'));

    await expect(
      gateway.send({
        channel: 'whatsapp',
        to: '+1234567890',
        message: 'Hello',
        credentials: {},
      }),
    ).rejects.toThrow('API failure');
  });
});
