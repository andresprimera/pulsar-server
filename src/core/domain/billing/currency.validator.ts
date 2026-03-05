/**
 * Pure currency validation. No dependencies.
 */

export const ISO_4217_PATTERN = /^[A-Z]{3}$/;

export function isValidCurrencyCode(code: string): boolean {
  return ISO_4217_PATTERN.test(code);
}

export function assertCurrencyMatch(
  snapshotCurrency: string,
  clientCurrency: string,
): void {
  if (snapshotCurrency !== clientCurrency) {
    throw new Error(
      `Currency mismatch: snapshot=${snapshotCurrency}, client=${clientCurrency}`,
    );
  }
}
