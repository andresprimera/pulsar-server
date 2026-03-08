export interface SendMessageInput {
  to: string;
  message: string;
  provider?: string;
  credentials: unknown;
}

export interface ChannelAdapter {
  readonly channel: string;

  sendMessage(input: SendMessageInput): Promise<void>;
}
