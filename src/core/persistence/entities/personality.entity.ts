export interface Personality {
  id: string;
  name: string;
  description: string;
  examplePhrases: string[];
  guardrails?: string;
  promptTemplate: string;
  status: 'active' | 'inactive' | 'archived';
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
