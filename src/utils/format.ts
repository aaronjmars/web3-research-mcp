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

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "`": "&#96;",
  "[": "&#91;",
  "]": "&#93;",
  "{": "&#123;",
  "}": "&#125;",
};

/**
 * Neutralizes HTML, Markdown and template metacharacters in caller-supplied
 * text so it can be quoted back in tool output or logs without being rendered.
 */
export const escapeText = (s: string): string =>
  s.replace(/[&<>"`[\]{}]/g, (c) => ESCAPES[c]);

/** Max length of caller input quoted back in tool output. */
const MAX_ECHO = 200;

/** Truncates caller input to `MAX_ECHO` chars and escapes it for output. */
export const quoteInput = (s: string): string =>
  escapeText(s.length > MAX_ECHO ? `${s.slice(0, MAX_ECHO)}...` : s);
