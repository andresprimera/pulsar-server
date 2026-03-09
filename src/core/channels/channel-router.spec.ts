import { DiscoveryService } from '@nestjs/core';
import { ChannelRouter } from './channel-router';
import { ChannelAdapter } from './channel-adapter.interface';
import { CHANNEL_ADAPTER_METADATA } from './channel-adapter.decorator';

describe('ChannelRouter', () => {
  const createAdapter = (channel: string): ChannelAdapter => ({
    channel,
    sendMessage: jest.fn().mockResolvedValue(undefined),
  });

  function createMockWrapper(
    instance: ChannelAdapter,
    metatype?: new (...args: unknown[]) => unknown,
  ) {
    const mt = metatype ?? class {};
    Reflect.defineMetadata(CHANNEL_ADAPTER_METADATA, true, mt);
    return { instance, metatype: mt };
  }

  function buildRouter(wrappers: ReturnType<typeof createMockWrapper>[]) {
    const discovery = {
      getProviders: jest.fn().mockReturnValue(wrappers),
    } as unknown as DiscoveryService;

    const router = new ChannelRouter(discovery);
    router.onModuleInit();
    return router;
  }

  it('discovers and resolves a registered channel adapter', () => {
    const whatsapp = createAdapter('whatsapp');
    const router = buildRouter([createMockWrapper(whatsapp)]);

    expect(router.resolve('whatsapp')).toBe(whatsapp);
  });

  it('throws for an unknown channel', () => {
    const router = buildRouter([]);

    expect(() => router.resolve('sms')).toThrow(
      'No channel adapter registered for channel="sms"',
    );
  });

  it('resolves correct adapter when multiple are registered', () => {
    const whatsapp = createAdapter('whatsapp');
    const sms = createAdapter('sms');
    const router = buildRouter([
      createMockWrapper(whatsapp),
      createMockWrapper(sms),
    ]);

    expect(router.resolve('whatsapp')).toBe(whatsapp);
    expect(router.resolve('sms')).toBe(sms);
  });

  it('reports channel availability via hasChannel', () => {
    const whatsapp = createAdapter('whatsapp');
    const router = buildRouter([createMockWrapper(whatsapp)]);

    expect(router.hasChannel('whatsapp')).toBe(true);
    expect(router.hasChannel('email')).toBe(false);
  });

  it('ignores providers without CHANNEL_ADAPTER_METADATA', () => {
    const undecorated = createAdapter('telegram');
    const wrapper = {
      instance: undecorated,
      metatype: class {},
    };

    const router = buildRouter([wrapper as any]);

    expect(router.hasChannel('telegram')).toBe(false);
  });

  it('ignores providers with null instance', () => {
    const mt = class {};
    Reflect.defineMetadata(CHANNEL_ADAPTER_METADATA, true, mt);
    const wrapper = { instance: null, metatype: mt };

    const router = buildRouter([wrapper as any]);

    expect(router.hasChannel('anything')).toBe(false);
  });
});
