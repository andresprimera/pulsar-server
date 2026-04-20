import type { LanguageModelUsage } from 'ai';

/** Narrow shape used for {@link LlmUsageLogRepository.create} token fields. */
export interface TokenTotalsForLlmLog {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function hasNumericTokenField(
  u: LanguageModelUsage | undefined,
): u is LanguageModelUsage {
  if (!u || typeof u !== 'object') {
    return false;
  }
  return ['inputTokens', 'outputTokens', 'totalTokens'].some((k) => {
    const v = (u as Record<string, unknown>)[k];
    return typeof v === 'number' && Number.isFinite(v);
  });
}

function toTotals(u: LanguageModelUsage): TokenTotalsForLlmLog {
  return {
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    totalTokens: u.totalTokens ?? 0,
  };
}

function sumStepUsages(
  steps: Array<{ usage?: LanguageModelUsage }> | undefined,
): TokenTotalsForLlmLog | undefined {
  if (!steps?.length) {
    return undefined;
  }
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let any = false;
  for (const step of steps) {
    const u = step.usage;
    if (!hasNumericTokenField(u)) {
      continue;
    }
    any = true;
    inputTokens += u.inputTokens ?? 0;
    outputTokens += u.outputTokens ?? 0;
    totalTokens += u.totalTokens ?? 0;
  }
  if (!any) {
    return undefined;
  }
  return { inputTokens, outputTokens, totalTokens };
}

/**
 * Picks token totals for {@link LlmUsageLogRepository} from `generateText` result:
 * `totalUsage` (SDK aggregate) → `usage` (last step) → sum of `steps[].usage`.
 */
export function extractLlmUsageFromGenerateTextResult(result: {
  usage?: LanguageModelUsage;
  totalUsage?: LanguageModelUsage;
  steps?: ReadonlyArray<{ usage?: LanguageModelUsage }>;
}): TokenTotalsForLlmLog | undefined {
  const totalUsage = result.totalUsage;
  if (hasNumericTokenField(totalUsage)) {
    return toTotals(totalUsage);
  }
  const usage = result.usage;
  if (hasNumericTokenField(usage)) {
    return toTotals(usage);
  }
  const summed = sumStepUsages([...(result.steps ?? [])]);
  if (summed !== undefined) {
    return summed;
  }
  return undefined;
}
