/** Attachment bytes for multimodal LLM input (no Nest / Multer types). */
export interface ClientContextSuggestionAttachment {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}

export interface CompanyBriefSuggestionInput {
  organizationName?: string;
  clientType?: 'individual' | 'organization';
  existingDraft?: string;
  instructions?: string;
  attachments: ClientContextSuggestionAttachment[];
}

export interface PromptSupplementSuggestionInput {
  organizationName?: string;
  clientType?: 'individual' | 'organization';
  companyBrief?: string;
  agentId?: string;
  agentName?: string;
  personalityId?: string;
  personalityName?: string;
  existingDraft?: string;
  instructions?: string;
  attachments: ClientContextSuggestionAttachment[];
}
