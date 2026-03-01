export interface AgentOutput {
  reply?: {
    type: 'text';
    text: string;
  };
  channelMeta?: {
    encryptedCredentials?: unknown;
  };
}
