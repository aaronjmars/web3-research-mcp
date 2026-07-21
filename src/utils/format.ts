/** Shared display formatters for tool output. */

/**
 * Renders a USD amount with a leading `$`, or `"n/a"` for null/undefined/
 * non-finite input. Used by both the CoinGecko and DeFiLlama formatters.
 */
export const fmtUsd = (
  n: number | null | undefined,
  digits = 0
): string => {
  if (n == null || !isFinite(n)) return "n/a";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
};
