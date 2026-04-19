import type { LanguageModelUsage } from 'ai';
import { extractLlmUsageFromGenerateTextResult } from './extract-llm-usage-from-generate-text-result';

const u = (partial: Partial<LanguageModelUsage>): LanguageModelUsage =>
  partial as LanguageModelUsage;

describe('extractLlmUsageFromGenerateTextResult', () => {
  it('prefers totalUsage when it has numeric token fields', () => {
    const usage = extractLlmUsageFromGenerateTextResult({
      totalUsage: u({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }),
      usage: u({ inputTokens: 99, outputTokens: 99, totalTokens: 99 }),
      steps: [],
    });
    expect(usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it('uses usage when totalUsage lacks numeric fields', () => {
    const usage = extractLlmUsageFromGenerateTextResult({
      totalUsage: u({}),
      usage: u({ inputTokens: 4, outputTokens: 5, totalTokens: 9 }),
      steps: [],
    });
    expect(usage).toEqual({ inputTokens: 4, outputTokens: 5, totalTokens: 9 });
  });

  it('sums steps when top-level usage objects are empty', () => {
    const usage = extractLlmUsageFromGenerateTextResult({
      totalUsage: u({}),
      usage: u({}),
      steps: [
        { usage: u({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }) },
        { usage: u({ inputTokens: 2, outputTokens: 0, totalTokens: 2 }) },
      ] as any,
    });
    expect(usage).toEqual({ inputTokens: 3, outputTokens: 1, totalTokens: 4 });
  });

  it('returns undefined when no usable usage exists', () => {
    expect(
      extractLlmUsageFromGenerateTextResult({
        totalUsage: u({}),
        usage: u({}),
        steps: [{ usage: u({}) }] as any,
      }),
    ).toBeUndefined();
  });
});
