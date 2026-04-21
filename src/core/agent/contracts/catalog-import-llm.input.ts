import type { LLMConfig } from '@domain/llm/llm.factory';

export type CatalogImportAttachmentInput = {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
};

export type CatalogImportLlmBatchInput = {
  llmConfig: LLMConfig;
  /** Primary instructions + tabular/text payload for this batch. */
  userText: string;
  /** Optional multimodal parts (images, small PDFs, etc.). */
  attachments?: CatalogImportAttachmentInput[];
};
