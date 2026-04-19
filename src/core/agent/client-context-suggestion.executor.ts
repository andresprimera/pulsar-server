import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { generateText, type LanguageModel, type UserContent } from 'ai';
import { createLLMModel } from './llm/llm.factory';
import { LlmProvider } from './llm/provider.enum';
import { decrypt } from '@shared/crypto.util';
import type {
  ClientContextSuggestionAttachment,
  CompanyBriefSuggestionInput,
  PromptSupplementSuggestionInput,
} from './contracts/client-context-suggestion.input';

@Injectable()
export class ClientContextSuggestionExecutor {
  private readonly logger = new Logger(ClientContextSuggestionExecutor.name);

  async generateCompanyBriefMarkdown(
    dto: CompanyBriefSuggestionInput,
  ): Promise<{ suggestedText: string }> {
    const apiKey = this.resolveServerOpenAiKey(
      'Server OPENAI_API_KEY is not configured; organization context generation is unavailable.',
    );

    const model = createLLMModel({
      provider: LlmProvider.OpenAI,
      apiKey,
      model: 'gpt-4o',
    });

    const systemPrompt =
      'You write concise organization context blocks for downstream AI customer agents. ' +
      'Cover: what the organization does, brand voice/tone, audience, and any boundaries or topics to avoid. ' +
      'Prefer GitHub-flavored structure: use ## or ### markdown headings for sections and blank lines between paragraphs so the result is easy to scan. ' +
      'Avoid long bullet lists unless the user asks. ' +
      'Do not invent private facts; if information is missing, keep suggestions generic and clearly phrased as assumptions. ' +
      'When the user attaches documents or images, extract only factual material relevant to describing the organization; ignore boilerplate and signatures.';

    const parts: string[] = [];
    const orgName = dto.organizationName?.trim();
    if (orgName) {
      parts.push(`Prospect organization or display name: ${orgName}`);
    }
    if (dto.clientType) {
      parts.push(`Client account type: ${dto.clientType}`);
    }
    const draft = dto.existingDraft?.trim();
    if (draft) {
      parts.push(
        `Current draft organization context (may revise or replace):\n${draft}`,
      );
    } else {
      parts.push('There is no existing organization context draft yet.');
    }
    const instr = dto.instructions?.trim();
    if (instr) {
      parts.push(`User instructions for this generation:\n${instr}`);
    }
    if (dto.attachments.length > 0) {
      parts.push(
        `The user attached ${dto.attachments.length} file(s) (${dto.attachments
          .map((f) => f.filename || 'unnamed')
          .join(
            ', ',
          )}). Use their content to inform the organization context when relevant.`,
      );
    }
    parts.push(
      'Rely only on the organization details, draft, instructions, and attachments supplied in this request. Produce organization context markdown suitable for injection into agent prompts.',
    );
    const userPrompt = parts.join('\n\n');

    const userContent = this.buildUserContentWithFiles(
      userPrompt,
      dto.attachments,
    );

    return this.runGenerateText(
      model,
      systemPrompt,
      userContent,
      'suggestCompanyBrief',
      'Failed to generate organization context',
    );
  }

  async generatePromptSupplementMarkdown(
    dto: PromptSupplementSuggestionInput,
  ): Promise<{ suggestedText: string }> {
    const apiKey = this.resolveServerOpenAiKey(
      'Server OPENAI_API_KEY is not configured; task context generation is unavailable.',
    );

    const model = createLLMModel({
      provider: LlmProvider.OpenAI,
      apiKey,
      model: 'gpt-4o',
    });

    const systemPrompt =
      'You write concise per-hire task context (a prompt supplement) for one specific AI agent deployment. ' +
      'It applies only to this hire, not the whole organization. ' +
      'Cover what the user describes: products or services this agent should emphasize, FAQs, policies, handoff or escalation rules, process steps, tools or systems to mention, and topics to avoid for this role. ' +
      'Prefer GitHub-flavored markdown with ## or ### headings and blank lines between sections. ' +
      'Avoid long bullet lists unless the user asks. ' +
      'Do not invent private or contractual facts; if information is missing, state reasonable assumptions explicitly. ' +
      "When the user attaches documents or images, extract only material relevant to this agent's tasks; ignore boilerplate and signatures.";

    const parts: string[] = [];
    const orgName = dto.organizationName?.trim();
    if (orgName) {
      parts.push(`Organization or display name: ${orgName}`);
    }
    if (dto.clientType) {
      parts.push(`Client account type: ${dto.clientType}`);
    }
    const brief = dto.companyBrief?.trim();
    if (brief) {
      parts.push(
        `Organization-wide context (for grounding only; task context should add hire-specific detail):\n${brief}`,
      );
    }
    const agentLabel =
      dto.agentName?.trim() ||
      (dto.agentId ? `Agent id: ${dto.agentId}` : undefined);
    if (agentLabel) {
      parts.push(`Selected agent: ${agentLabel}`);
    }
    const personalityLabel =
      dto.personalityName?.trim() ||
      (dto.personalityId ? `Personality id: ${dto.personalityId}` : undefined);
    if (personalityLabel) {
      parts.push(`Selected personality: ${personalityLabel}`);
    }
    const draft = dto.existingDraft?.trim();
    if (draft) {
      parts.push(
        `Current draft task context (may revise or replace):\n${draft}`,
      );
    } else {
      parts.push('There is no existing task context draft yet.');
    }
    const instr = dto.instructions?.trim();
    if (instr) {
      parts.push(`User instructions for this generation:\n${instr}`);
    }
    if (dto.attachments.length > 0) {
      parts.push(
        `The user attached ${dto.attachments.length} file(s) (${dto.attachments
          .map((f) => f.filename || 'unnamed')
          .join(
            ', ',
          )}). Use their content to inform this hire's task context when relevant.`,
      );
    }
    parts.push(
      'This is pre-signup onboarding: produce markdown task context suitable for the client_agent promptSupplement field after they complete registration.',
    );
    const userPrompt = parts.join('\n\n');

    const userContent = this.buildUserContentWithFiles(
      userPrompt,
      dto.attachments,
    );

    return this.runGenerateText(
      model,
      systemPrompt,
      userContent,
      'suggestPromptSupplement',
      'Failed to generate task context',
    );
  }

  private resolveServerOpenAiKey(missingKeyMessage: string): string {
    const rawApiKey = process.env.OPENAI_API_KEY ?? '';
    const apiKey = decrypt(rawApiKey);
    if (!apiKey || !String(apiKey).trim()) {
      throw new BadRequestException(missingKeyMessage);
    }
    return apiKey;
  }

  private buildUserContentWithFiles(
    userPrompt: string,
    files: ClientContextSuggestionAttachment[],
  ): UserContent {
    const userContent: UserContent = [{ type: 'text', text: userPrompt }];
    for (const file of files) {
      const mime = file.mimeType.toLowerCase();
      if (mime.startsWith('image/')) {
        userContent.push({
          type: 'image',
          image: file.buffer,
          mediaType: mime,
        });
      } else {
        userContent.push({
          type: 'file',
          data: file.buffer,
          mediaType: mime,
          filename: file.filename,
        });
      }
    }
    return userContent;
  }

  private async runGenerateText(
    model: LanguageModel,
    systemPrompt: string,
    userContent: UserContent,
    logLabel: string,
    failureMessage: string,
  ): Promise<{ suggestedText: string }> {
    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
      const suggestedText = text?.trim() ?? '';
      if (!suggestedText) {
        throw new HttpException(
          'The model returned an empty suggestion',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return { suggestedText };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      const message =
        err instanceof Error ? err.message : 'LLM suggestion failed';
      this.logger.warn(`${logLabel} failed: ${message}`);
      throw new HttpException(failureMessage, HttpStatus.BAD_GATEWAY);
    }
  }
}
