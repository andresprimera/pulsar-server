export const EMPTY_PRICES: readonly { currency: string; amount: number }[] =
  Object.freeze([]);

export type CatalogPrice = { currency: string; amount: number };

export function toPlain<T>(doc: T): T {
  return (doc as any)?.toObject ? (doc as any).toObject() : { ...(doc as any) };
}

/**
 * Standardized channel API response: id (not _id), guaranteed arrays for
 * supportedProviders and prices, no Mongoose internals.
 */
export function toChannelResponse(
  plain: Record<string, unknown>,
  prices: CatalogPrice[],
): Record<string, unknown> {
  const id = plain._id != null ? String(plain._id) : undefined;
  const supportedProviders = Array.isArray(plain.supportedProviders)
    ? plain.supportedProviders
    : [];
  return {
    id,
    name: plain.name ?? '',
    type: plain.type ?? '',
    supportedProviders,
    monthlyMessageQuota:
      plain.monthlyMessageQuota !== undefined && plain.monthlyMessageQuota !== null
        ? plain.monthlyMessageQuota
        : null,
    prices: Array.isArray(prices) ? [...prices] : [],
  };
}

/**
 * Standardized agent API response: id (not _id), guaranteed prices array,
 * optional llmOverride and monthlyTokenQuota, timestamps; no __v or createdBySeeder.
 */
export function toAgentResponse(
  plain: Record<string, unknown>,
  prices: CatalogPrice[],
): Record<string, unknown> {
  const id = plain._id != null ? String(plain._id) : undefined;
  const llmOverride = plain.llmOverride &&
    typeof plain.llmOverride === 'object' &&
    plain.llmOverride !== null &&
    'provider' in plain.llmOverride &&
    'model' in plain.llmOverride
    ? {
        provider: (plain.llmOverride as { provider: string }).provider,
        model: (plain.llmOverride as { model: string }).model,
      }
    : undefined;
  return {
    id,
    name: plain.name ?? '',
    systemPrompt: plain.systemPrompt ?? '',
    status: plain.status ?? 'active',
    ...(llmOverride && { llmOverride }),
    monthlyTokenQuota:
      plain.monthlyTokenQuota !== undefined && plain.monthlyTokenQuota !== null
        ? plain.monthlyTokenQuota
        : null,
    prices: Array.isArray(prices) ? [...prices] : [],
    createdAt: plain.createdAt ?? undefined,
    updatedAt: plain.updatedAt ?? undefined,
  };
}

export function buildActivePricesMap<T>(
  prices: T[],
  getOwnerId: (price: T) => string,
  getCurrency: (price: T) => string,
  getAmount: (price: T) => number,
  getStatus: (price: T) => string,
): Map<string, { currency: string; amount: number }[]> {
  const priceMap = new Map<string, { currency: string; amount: number }[]>();
  const activePrices = prices.filter((p) => getStatus(p) === 'active');

  for (const price of activePrices) {
    const key = getOwnerId(price);
    let arr = priceMap.get(key);
    if (!arr) {
      arr = [];
      priceMap.set(key, arr);
    }
    arr.push({
      currency: getCurrency(price),
      amount: getAmount(price),
    });
  }

  priceMap.forEach((arr) =>
    arr.sort((a, b) => a.currency.localeCompare(b.currency)),
  );

  return priceMap;
}
