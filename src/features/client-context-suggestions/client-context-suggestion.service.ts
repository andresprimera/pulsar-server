import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentService } from '@agent/agent.service';
import type {
  ClientContextSuggestionAttachment,
  CompanyBriefSuggestionInput,
  PromptSupplementSuggestionInput,
} from '@agent/contracts/client-context-suggestion.input';
import { SuggestCompanyBriefDto } from './dto/suggest-company-brief.dto';
import { SuggestPromptSupplementDto } from './dto/suggest-prompt-supplement.dto';

const SUGGEST_ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]);

@Injectable()
export class ClientContextSuggestionService {
  constructor(private readonly agentService: AgentService) {}

  async suggestCompanyBrief(
    dto: SuggestCompanyBriefDto,
    files: Express.Multer.File[],
  ): Promise<{ suggestedText: string }> {
    this.assertSuggestAttachmentMime(files);
    const input: CompanyBriefSuggestionInput = {
      organizationName: dto.organizationName,
      clientType: dto.clientType,
      existingDraft: dto.existingDraft,
      instructions: dto.instructions,
      attachments: this.mapUploadedFiles(files),
    };
    return await this.agentService.suggestCompanyBriefMarkdown(input);
  }

  async suggestPromptSupplement(
    dto: SuggestPromptSupplementDto,
    files: Express.Multer.File[],
  ): Promise<{ suggestedText: string }> {
    this.assertSuggestAttachmentMime(files);
    const input: PromptSupplementSuggestionInput = {
      organizationName: dto.organizationName,
      clientType: dto.clientType,
      companyBrief: dto.companyBrief,
      agentId: dto.agentId,
      agentName: dto.agentName,
      personalityId: dto.personalityId,
      personalityName: dto.personalityName,
      existingDraft: dto.existingDraft,
      instructions: dto.instructions,
      attachments: this.mapUploadedFiles(files),
    };
    return await this.agentService.suggestPromptSupplementMarkdown(input);
  }

  private assertSuggestAttachmentMime(files: Express.Multer.File[]): void {
    for (const file of files) {
      const mime = file.mimetype?.toLowerCase() ?? '';
      if (!SUGGEST_ALLOWED_MIME.has(mime)) {
        throw new BadRequestException(
          `Unsupported file type: ${file.mimetype}. Allowed: images (png, jpeg, webp, gif), PDF, plain text.`,
        );
      }
    }
  }

  private mapUploadedFiles(
    files: Express.Multer.File[],
  ): ClientContextSuggestionAttachment[] {
    return files.map((f) => ({
      buffer: f.buffer,
      mimeType: f.mimetype,
      filename: f.originalname,
    }));
  }
}
