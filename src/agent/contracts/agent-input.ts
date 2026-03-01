import { ChannelType } from '@channels/shared/channel-type.type';

export interface AgentInput {
  channel: ChannelType;
  contactId: string;
  conversationId: string;
  message: {
    type: 'text';
    text: string;
  };
  contactMetadata?: Record<string, unknown>;
  contactSummary?: string;
  metadata?: Record<string, unknown>;
}
