import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fetch from "node-fetch";
import ResearchStorage from "../storage/researchStorage.js";

const DEFILLAMA_BASE = "https://api.llama.fi";
const DEFILLAMA_TIMEOUT_MS = 15000;
const PROTOCOLS_CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_CHART_THRESHOLD_SEC = 7 * 86400;

interface DLProtocolListEntry {
  id: string;
  name: string;
  symbol?: string | null;
  slug: string;
  url?: string | null;
  description?: string | null;
  chain?: string | null;
  chains?: string[];
  category?: string | null;
  tvl?: number | null;
  twitter?: string | null;
  logo?: string | null;
}

interface DLProtocolDetail extends DLProtocolListEntry {
  address?: string | null;
  audits?: string | null;
  audit_links?: string[];
  language?: string | null;
  currentChainTvls?: Record<string, number>;
  raises?: Array<{
    date?: number;
    name?: string;
    round?: string;
    amount?: number;
    chains?: string[];
    leadInvestors?: string[];
    otherInvestors?: string[];
    valuation?: number;
  }>;
  mcap?: number | null;
}

interface DLFeesSummary {
  name?: string;
  total24h?: number | null;
  total7d?: number | null;
  total30d?: number | null;
  totalAllTime?: number | null;
  change_1d?: number | null;
  change_7d?: number | null;
  change_1m?: number | null;
}

interface DLTvlChartPoint {
  date: number; // unix seconds
  totalLiquidityUSD: number;
}

interface TvlHistorySummary {
  athTvl: number | null;
  athDate: number | null;
  fromAthPct: number | null;
  current: number;
  d30Ago: number | null;
  d90Ago: number | null;
  d365Ago: number | null;
  change30dPct: number | null;
  change90dPct: number | null;
  change365dPct: number | null;
  // Date (unix seconds) of the last chart point, set only when the chart is
  // more than STALE_CHART_THRESHOLD_SEC behind wall-clock (stale/delisted).
  staleChartDate: number | null;
}

let protocolsCache: { data: DLProtocolListEntry[]; fetchedAt: number } | null =
  null;

async function dlFetch(path: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "web3-research-mcp",
  };

  // node-fetch v2 doesn't support AbortSignal.timeout(); use AbortController.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFILLAMA_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${DEFILLAMA_BASE}${path}`, {
      headers,
      signal: controller.signal as any,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(
        `DeFiLlama request timed out after ${DEFILLAMA_TIMEOUT_MS}ms`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    throw new Error(
      "DeFiLlama rate limit hit (429). Wait a minute and retry."
    );
  }

  if (!response.ok) {
    throw new Error(
      `DeFiLlama API error ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

async function getProtocols(): Promise<DLProtocolListEntry[]> {
  const now = Date.now();
  if (
    protocolsCache &&
    now - protocolsCache.fetchedAt < PROTOCOLS_CACHE_TTL_MS
  ) {
    return protocolsCache.data;
  }
  const data = (await dlFetch("/protocols")) as DLProtocolListEntry[];
  protocolsCache = { data, fetchedAt: now };
  return data;
}

interface ResolveProtocolResult {
  protocol: DLProtocolListEntry;
  ambiguous: boolean;
  candidateCount: number;
  matchedOn: string;
}

function pickHighestTvl(
  candidates: DLProtocolListEntry[]
): DLProtocolListEntry {
  return [...candidates].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))[0];
}

async function resolveProtocol(
  tokenName: string,
  tokenTicker: string
): Promise<ResolveProtocolResult | null> {
  const protocols = await getProtocols();
  const tickerUpper = tokenTicker.trim().toUpperCase();
  const nameLower = tokenName.trim().toLowerCase();
  const tickerLower = tokenTicker.trim().toLowerCase();

  if (tickerUpper) {
    const tickerMatches = protocols.filter(
      (p) => p.symbol?.toUpperCase() === tickerUpper
    );
    if (tickerMatches.length > 0) {
      return {
        protocol: pickHighestTvl(tickerMatches),
        ambiguous: tickerMatches.length > 1,
        candidateCount: tickerMatches.length,
        matchedOn: `symbol "${tickerUpper}"`,
      };
    }
  }

  if (nameLower) {
    const nameMatches = protocols.filter(
      (p) => p.name?.toLowerCase() === nameLower
    );
    if (nameMatches.length > 0) {
      return {
        protocol: pickHighestTvl(nameMatches),
        ambiguous: nameMatches.length > 1,
        candidateCount: nameMatches.length,
        matchedOn: `name "${tokenName}"`,
      };
    }
  }

  const slugMatches = protocols.filter(
    (p) => p.slug === nameLower || p.slug === tickerLower
  );
  if (slugMatches.length > 0) {
    return {
      protocol: pickHighestTvl(slugMatches),
      ambiguous: slugMatches.length > 1,
      candidateCount: slugMatches.length,
      matchedOn: `slug`,
    };
  }

  if (nameLower.length >= 3) {
    const containsMatches = protocols.filter((p) =>
      p.name?.toLowerCase().includes(nameLower)
    );
    if (containsMatches.length > 0) {
      return {
        protocol: pickHighestTvl(containsMatches),
        ambiguous: containsMatches.length > 1,
        candidateCount: containsMatches.length,
        matchedOn: `name contains "${tokenName}"`,
      };
    }
  }

  return null;
}

// /protocol/{slug} returns `tvl` as a daily chart array of
// `{date, totalLiquidityUSD}` (unix seconds). The DLProtocolListEntry
// type declares `tvl?: number | null;` for the index endpoint, so we cast
// at the use site rather than narrowing on the detail type.
function computeTvlHistory(
  detail: DLProtocolDetail,
  currentTvl: number | null
): TvlHistorySummary | null {
  const chart = (detail as { tvl?: unknown }).tvl;
  if (!Array.isArray(chart) || chart.length === 0) return null;

  const validPoints = chart.filter(
    (p): p is DLTvlChartPoint =>
      typeof p?.date === "number" &&
      typeof p?.totalLiquidityUSD === "number" &&
      isFinite(p.totalLiquidityUSD)
  );
  if (validPoints.length === 0) return null;

  // The live API returns the chart date-ascending, but that's unenforced;
  // sort defensively since the window math below walks from the end.
  validPoints.sort((a, b) => a.date - b.date);

  let athTvl = 0;
  let athDate = 0;
  for (const p of validPoints) {
    if (p.totalLiquidityUSD > athTvl) {
      athTvl = p.totalLiquidityUSD;
      athDate = p.date;
    }
  }

  const last = validPoints[validPoints.length - 1];
  // Prefer the index `currentTvl` (matches the rendered "Total TVL"); fall
  // back to the latest chart point if the index value is missing.
  const current =
    typeof currentTvl === "number" ? currentTvl : last.totalLiquidityUSD;
  // Windows anchor to the last chart point (the right call for sparse charts),
  // but for stale/delisted protocols "30d ago" then silently means "30d before
  // the last datapoint" — surface that instead of staying quiet.
  const nowSec = last.date;
  const staleChartDate =
    Date.now() / 1000 - last.date > STALE_CHART_THRESHOLD_SEC
      ? last.date
      : null;

  const findAgo = (daysAgo: number): number | null => {
    const target = nowSec - daysAgo * 86400;
    if (target < validPoints[0].date) return null;
    // Chart is chronologically ordered; walk back to the latest snapshot ≤ target.
    for (let i = validPoints.length - 1; i >= 0; i--) {
      if (validPoints[i].date <= target) return validPoints[i].totalLiquidityUSD;
    }
    return null;
  };

  const d30 = findAgo(30);
  const d90 = findAgo(90);
  const d365 = findAgo(365);

  const pctChange = (prev: number | null): number | null => {
    if (prev == null || prev === 0) return null;
    return ((current - prev) / prev) * 100;
  };

  // An all-zero chart has no meaningful ATH; null lets the formatter skip
  // those lines instead of rendering "ATH TVL: $0 (n/a)".
  const hasAth = athTvl > 0;

  return {
    athTvl: hasAth ? athTvl : null,
    athDate: hasAth ? athDate : null,
    fromAthPct: hasAth ? ((current - athTvl) / athTvl) * 100 : null,
    current,
    d30Ago: d30,
    d90Ago: d90,
    d365Ago: d365,
    change30dPct: pctChange(d30),
    change90dPct: pctChange(d90),
    change365dPct: pctChange(d365),
    staleChartDate,
  };
}

async function fetchFees(slug: string): Promise<DLFeesSummary | null> {
  try {
    return (await dlFetch(
      `/summary/fees/${encodeURIComponent(slug)}?dataType=dailyFees`
    )) as DLFeesSummary;
  } catch {
    return null;
  }
}

const fmtUsd = (n: number | null | undefined, digits = 0): string => {
  if (n == null || !isFinite(n)) return "n/a";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
};

const fmtPct = (n: number | null | undefined): string => {
  if (n == null || !isFinite(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

function parseAddresses(detail: DLProtocolDetail): string[] {
  // DeFiLlama uses two formats:
  // - top-level `address`: "ethereum:0xabc..." (single canonical address)
  // - `currentChainTvls`: keys like "Ethereum", "Arbitrum-borrowed" (chains used)
  const lines: string[] = [];
  if (detail.address && typeof detail.address === "string") {
    lines.push(`  - ${detail.address}`);
  }
  return lines;
}

function formatProtocolSummary(
  detail: DLProtocolDetail,
  fees: DLFeesSummary | null,
  totalTvl: number | null,
  tvlHistory: TvlHistorySummary | null
): string {
  const chainTvls = detail.currentChainTvls ?? {};
  const chainTvlLines = Object.entries(chainTvls)
    .filter(([chain]) => !chain.includes("-")) // skip "-borrowed", "-staking" derivatives
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .slice(0, 8)
    .map(([chain, tvl]) => `  - ${chain}: ${fmtUsd(tvl, 0)}`)
    .join("\n");

  const tvlHistoryLines: string[] = [];
  if (tvlHistory) {
    if (tvlHistory.athTvl != null) {
      const athDateStr = tvlHistory.athDate
        ? new Date(tvlHistory.athDate * 1000).toISOString().slice(0, 10)
        : "n/a";
      tvlHistoryLines.push(
        `- ATH TVL: ${fmtUsd(tvlHistory.athTvl, 0)} (${athDateStr})`
      );
      tvlHistoryLines.push(`- From ATH: ${fmtPct(tvlHistory.fromAthPct)}`);
    }
    if (tvlHistory.d30Ago != null) {
      tvlHistoryLines.push(
        `- 30d ago: ${fmtUsd(tvlHistory.d30Ago, 0)} (change ${fmtPct(
          tvlHistory.change30dPct
        )})`
      );
    }
    if (tvlHistory.d90Ago != null) {
      tvlHistoryLines.push(
        `- 90d ago: ${fmtUsd(tvlHistory.d90Ago, 0)} (change ${fmtPct(
          tvlHistory.change90dPct
        )})`
      );
    }
    if (tvlHistory.d365Ago != null) {
      tvlHistoryLines.push(
        `- 365d ago: ${fmtUsd(tvlHistory.d365Ago, 0)} (change ${fmtPct(
          tvlHistory.change365dPct
        )})`
      );
    }
    if (tvlHistory.staleChartDate != null) {
      const staleDateStr = new Date(tvlHistory.staleChartDate * 1000)
        .toISOString()
        .slice(0, 10);
      tvlHistoryLines.push(
        `- Note: TVL chart last updated ${staleDateStr}; ATH/history windows are relative to that date.`
      );
    }
  }
  if (detail.mcap != null) {
    tvlHistoryLines.push(`- Market cap: ${fmtUsd(detail.mcap, 0)}`);
  }

  const addressLines = parseAddresses(detail);

  const links: string[] = [];
  if (detail.url) links.push(`  - Website: ${detail.url}`);
  if (detail.twitter) links.push(`  - Twitter: https://twitter.com/${detail.twitter}`);
  if (detail.audit_links && detail.audit_links.length > 0) {
    links.push(`  - Audits: ${detail.audit_links.slice(0, 3).join(", ")}`);
  }

  const raises = (detail.raises ?? []).slice(0, 5).map((r) => {
    const amount =
      typeof r.amount === "number" ? `$${r.amount.toLocaleString("en-US")}` : "n/a";
    const date = r.date ? new Date(r.date * 1000).toISOString().slice(0, 10) : "n/a";
    const round = r.round ?? "round";
    const lead = r.leadInvestors?.length ? ` — lead: ${r.leadInvestors.join(", ")}` : "";
    return `  - ${date} ${round}: ${amount}${lead}`;
  });

  const feesSection: string[] = [];
  if (fees) {
    feesSection.push("");
    feesSection.push("## Fees");
    feesSection.push(`- 24h: ${fmtUsd(fees.total24h, 0)}`);
    feesSection.push(`- 7d: ${fmtUsd(fees.total7d, 0)}`);
    feesSection.push(`- 30d: ${fmtUsd(fees.total30d, 0)}`);
    feesSection.push(`- All-time: ${fmtUsd(fees.totalAllTime, 0)}`);
    if (fees.change_1d != null) feesSection.push(`- 24h change: ${fmtPct(fees.change_1d)}`);
    if (fees.change_7d != null) feesSection.push(`- 7d change: ${fmtPct(fees.change_7d)}`);
  }

  const lines = [
    `# ${detail.name}${detail.symbol ? ` (${detail.symbol})` : ""} — DeFiLlama`,
    detail.category ? `Category: ${detail.category}` : null,
    detail.chain ? `Primary chain: ${detail.chain}` : null,
    "",
    "## TVL",
    `- Total TVL: ${fmtUsd(totalTvl, 0)}`,
    ...tvlHistoryLines,
    "",
    "## Per-chain TVL",
    chainTvlLines || "  (none reported)",
    ...feesSection,
    "",
    "## Token addresses",
    addressLines.length > 0 ? addressLines.join("\n") : "  (none listed)",
    "",
    "## Raises",
    raises.length > 0 ? raises.join("\n") : "  (none listed)",
    "",
    "## Links",
    links.length > 0 ? links.join("\n") : "  (none listed)",
    "",
    detail.description ? `## Description\n${detail.description}` : null,
  ].filter((line) => line !== null);

  return lines.join("\n");
}

export function registerDeFiLlamaTools(
  server: McpServer,
  storage: ResearchStorage
): void {
  server.tool(
    "defillama-data",
    {
      tokenName: z
        .string()
        .describe("Full protocol/token name (e.g., 'Uniswap')"),
      tokenTicker: z.string().describe("Ticker symbol (e.g., 'UNI')"),
    },
    async ({
      tokenName,
      tokenTicker,
    }: {
      tokenName: string;
      tokenTicker: string;
    }) => {
      storage.addLogEntry(
        `Fetching DeFiLlama data for ${tokenName} (${tokenTicker})`
      );

      try {
        const resolved = await resolveProtocol(tokenName, tokenTicker);
        if (!resolved) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `DeFiLlama: no protocol found matching ${tokenName} (${tokenTicker}). Use \`defillama-search\` to look up candidate slugs.`,
              },
            ],
          };
        }

        const { protocol: match, ambiguous, candidateCount, matchedOn } =
          resolved;

        const detail = (await dlFetch(
          `/protocol/${encodeURIComponent(match.slug)}`
        )) as DLProtocolDetail;

        const fees = await fetchFees(match.slug);

        // /protocols returns `tvl` as a numeric current TVL (sum across chains).
        // /protocol/{slug} returns `tvl` as a historical chart array, which
        // `computeTvlHistory` walks for ATH + 30/90/365-day comparisons.
        // Prefer the numeric index value for the headline "Total TVL".
        const totalTvl = typeof match.tvl === "number" ? match.tvl : null;
        const tvlHistory = computeTvlHistory(detail, totalTvl);

        const summary = formatProtocolSummary(detail, fees, totalTvl, tvlHistory);
        const ambiguityWarning = ambiguous
          ? `> ⚠️ ${candidateCount} protocols matched on ${matchedOn}; showing highest-TVL match (\`${match.slug}\`). Use \`defillama-search\` to disambiguate.\n\n`
          : "";
        const resourceId = `defillama_${match.slug}_${new Date().getTime()}`;

        storage.addToSection("resources", {
          [resourceId]: {
            url: `${DEFILLAMA_BASE}/protocol/${match.slug}`,
            format: "markdown",
            content: `${ambiguityWarning}${summary}`,
            title: `DeFiLlama: ${detail.name}${
              detail.symbol ? ` (${detail.symbol})` : ""
            }`,
            source: "DeFiLlama",
            fetchedAt: new Date().toISOString(),
          },
        });

        storage.addToSection("marketData", {
          [`defillama_${match.slug}`]: {
            slug: match.slug,
            name: detail.name,
            symbol: detail.symbol,
            category: detail.category,
            tvl_usd: totalTvl,
            tvl_ath_usd: tvlHistory?.athTvl ?? null,
            // ISO date, matching the rendered summary and the ISO-string
            // convention of stored records (e.g. `fetchedAt`).
            tvl_ath_date: tvlHistory?.athDate
              ? new Date(tvlHistory.athDate * 1000).toISOString().slice(0, 10)
              : null,
            tvl_from_ath_pct: tvlHistory?.fromAthPct ?? null,
            tvl_change_30d_pct: tvlHistory?.change30dPct ?? null,
            tvl_change_90d_pct: tvlHistory?.change90dPct ?? null,
            tvl_change_365d_pct: tvlHistory?.change365dPct ?? null,
            mcap_usd: detail.mcap ?? null,
            chains: detail.chains,
            fees_24h_usd: fees?.total24h ?? null,
            fees_7d_usd: fees?.total7d ?? null,
            fees_30d_usd: fees?.total30d ?? null,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `${ambiguityWarning}${summary}\n\nSaved as resource: research://resource/${resourceId}`,
            },
          ],
        };
      } catch (error) {
        storage.addLogEntry(`DeFiLlama fetch failed: ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching DeFiLlama data: ${error}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "defillama-search",
    {
      query: z
        .string()
        .describe(
          "Search query — protocol name, ticker, or slug. Returns candidate DeFiLlama protocols with their slugs."
        ),
    },
    async ({ query }: { query: string }) => {
      storage.addLogEntry(`DeFiLlama search: "${query}"`);

      try {
        const protocols = await getProtocols();
        const q = query.trim().toLowerCase();
        const qUpper = query.trim().toUpperCase();

        const scored = protocols
          .map((p) => {
            const name = p.name?.toLowerCase() ?? "";
            const symbol = p.symbol?.toUpperCase() ?? "";
            const slug = p.slug?.toLowerCase() ?? "";

            let score = 0;
            if (symbol === qUpper) score += 100;
            if (name === q) score += 80;
            if (slug === q) score += 70;
            if (name.startsWith(q)) score += 30;
            if (slug.startsWith(q)) score += 20;
            if (name.includes(q)) score += 10;
            return { p, score };
          })
          .filter((x) => x.score > 0)
          .sort(
            (a, b) =>
              b.score - a.score || (b.p.tvl ?? 0) - (a.p.tvl ?? 0)
          )
          .slice(0, 10)
          .map((x) => x.p);

        if (scored.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No DeFiLlama matches for "${query}"`,
              },
            ],
          };
        }

        const lines = scored.map(
          (p) =>
            `- ${p.name} (${p.symbol ?? "—"}) — slug: \`${p.slug}\` — TVL: ${fmtUsd(
              p.tvl,
              0
            )}${p.category ? ` — ${p.category}` : ""}`
        );

        return {
          content: [
            {
              type: "text",
              text: `DeFiLlama matches for "${query}":\n\n${lines.join(
                "\n"
              )}\n\nUse \`defillama-data\` with the matching name/ticker for full details.`,
            },
          ],
        };
      } catch (error) {
        storage.addLogEntry(`DeFiLlama search failed: ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error searching DeFiLlama: ${error}`,
            },
          ],
        };
      }
    }
  );
}
