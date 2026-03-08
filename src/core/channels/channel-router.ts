import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { ChannelAdapter } from './channel-adapter.interface';
import { CHANNEL_ADAPTER_METADATA } from './channel-adapter.decorator';

@Injectable()
export class ChannelRouter implements OnModuleInit {
  private readonly adapters = new Map<string, ChannelAdapter>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || !wrapper.metatype) {
        continue;
      }

      const isAdapter = Reflect.getMetadata(
        CHANNEL_ADAPTER_METADATA,
        wrapper.metatype,
      );
      if (!isAdapter) {
        continue;
      }

      const adapter = instance as ChannelAdapter;
      if (typeof adapter.channel !== 'string' || !adapter.sendMessage) {
        continue;
      }

      this.adapters.set(adapter.channel, adapter);
    }
  }

  resolve(channel: string): ChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new Error(`No channel adapter registered for channel="${channel}"`);
    }
    return adapter;
  }

  hasChannel(channel: string): boolean {
    return this.adapters.has(channel);
  }
}
