export interface IncomingChannelEvent {
  clientId?: string;
  channelId: string;
  routeChannelIdentifier: string;
  channelIdentifier: string;
  messageId: string;
  text: string;
  rawPayload?: any;
}
