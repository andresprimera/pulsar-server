export const EMPTY_PRICES: readonly { currency: string; amount: number }[] =
  Object.freeze([]);

export function toPlain<T>(doc: T): T {
  return (doc as any)?.toObject ? (doc as any).toObject() : { ...(doc as any) };
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
