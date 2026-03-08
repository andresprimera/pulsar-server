import { ChannelProviderValue } from '@shared/channel-provider.constants';

export interface AgentOutput {
  reply?: {
    type: 'text';
    text: string;
  };
  channelMeta?: {
    encryptedCredentials?: unknown;
    provider?: ChannelProviderValue;
  };
}
