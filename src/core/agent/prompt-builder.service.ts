import { Injectable } from '@nestjs/common';
import { AgentContext } from './contracts/agent-context';

const SECTION_SEP = '\n\n';

/**
 * Centralized prompt construction. Builds the final system prompt in deterministic
 * section order:
 * [Agent Instructions] → [Organization Context] → [Personality] → [Personality Examples] →
 * [Personality Guardrails] → [Task Context] → [Client Context] → [Contact Context] → [Safety Rules].
 */
@Injectable()
export class PromptBuilderService {
  build(
    context: AgentContext,
    safeMetadata: Record<string, unknown>,
    contactSummary?: string,
  ): string {
    const sections: string[] = [];

    // [Agent Instructions]
    if (context.systemPrompt?.trim()) {
      sections.push(`[Agent Instructions]\n${context.systemPrompt.trim()}`);
    }

    // [Organization Context]
    if (context.companyBrief?.trim()) {
      sections.push(`[Organization Context]\n${context.companyBrief.trim()}`);
    }

    // [Personality]
    if (
      context.personality?.promptTemplate &&
      context.personality.promptTemplate.trim()
    ) {
      sections.push(
        `[Personality]\n${context.personality.promptTemplate.trim()}`,
      );
    }

    // [Personality Examples]
    if (context.personality?.examplePhrases?.length) {
      const examples = context.personality.examplePhrases
        .map((p) => `• ${(p ?? '').trim()}`)
        .filter((line) => line !== '• ')
        .join('\n');
      if (examples) {
        sections.push(
          `[Personality Examples]\nExamples of how you should speak:\n\n${examples}`,
        );
      }
    }

    // [Personality Guardrails]
    if (context.personality?.guardrails?.trim()) {
      sections.push(
        `[Personality Guardrails]\n${context.personality.guardrails.trim()}`,
      );
    }

    // [Task Context]
    if (context.promptSupplement?.trim()) {
      sections.push(`[Task Context]\n${context.promptSupplement.trim()}`);
    }

    // [Client Context]
    const clientLines: string[] = [];
    if (context.clientName?.trim()) {
      clientLines.push(`You are representing "${context.clientName.trim()}".`);
    }
    if (context.agentName?.trim()) {
      clientLines.push(`Your role is "${context.agentName.trim()}".`);
    }
    if (clientLines.length > 0) {
      clientLines.push(
        'In your first message to a new user, introduce yourself by mentioning the company you represent and your role.',
      );
      sections.push(`[Client Context]\n${clientLines.join(' ')}`);
    }

    // [Contact Context]
    const contactLines: string[] = [];
    if (contactSummary?.trim()) {
      contactLines.push(`Contact summary: ${contactSummary.trim()}`);
    }
    if (
      safeMetadata &&
      typeof safeMetadata === 'object' &&
      Object.keys(safeMetadata).length > 0
    ) {
      contactLines.push(
        `Safe contact metadata: ${JSON.stringify(safeMetadata)}`,
      );
    }
    if (
      typeof (safeMetadata as Record<string, unknown>)?.firstName === 'string'
    ) {
      const firstName = (safeMetadata as Record<string, unknown>)
        .firstName as string;
      if (firstName.trim()) {
        contactLines.push(
          `If you greet the contact, you may use their first name: ${firstName.trim()}.`,
        );
      }
    }
    if (contactLines.length > 0) {
      sections.push(`[Contact Context]\n${contactLines.join('\n')}`);
    }

    // [Safety Rules]
    sections.push(
      '[Safety Rules]\nDo not imply prior-conversation memory or continuity unless it is explicitly present in this conversation history.',
    );

    return sections.join(SECTION_SEP);
  }
}
