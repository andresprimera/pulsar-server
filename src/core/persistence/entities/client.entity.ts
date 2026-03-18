export interface Client {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  llmPreferences?: {
    provider: string;
    defaultModel: string;
  };
  /** Optional client-level LLM config. apiKey never exposed in normal API responses. */
  llmConfig?: {
    provider: string;
    model: string;
    apiKey?: string;
  };
}
