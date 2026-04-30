import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fetch from "node-fetch";
import ResearchStorage from "../storage/researchStorage.js";

const DEFILLAMA_BASE = "https://api.llama.fi";
const DEFILLAMA_TIMEOUT_MS = 15000;
const PROTOCOLS_CACHE_TTL_MS = 5 * 60 * 1000;

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
  totalTvl: number | null
): string {
  const chainTvls = detail.currentChainTvls ?? {};
  const chainTvlLines = Object.entries(chainTvls)
    .filter(([chain]) => !chain.includes("-")) // skip "-borrowed", "-staking" derivatives
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .slice(0, 8)
    .map(([chain, tvl]) => `  - ${chain}: ${fmtUsd(tvl, 0)}`)
    .join("\n");

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
        // /protocol/{slug} returns `tvl` as a historical chart array, so we
        // can't reuse it as a number. Prefer the numeric value from the index.
        const totalTvl = typeof match.tvl === "number" ? match.tvl : null;

        const summary = formatProtocolSummary(detail, fees, totalTvl);
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
