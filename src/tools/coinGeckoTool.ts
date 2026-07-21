import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import ResearchStorage from "../storage/researchStorage.js";

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const COINGECKO_BASE = COINGECKO_API_KEY
  ? "https://pro-api.coingecko.com/api/v3"
  : "https://api.coingecko.com/api/v3";
const COINGECKO_TIMEOUT_MS = 15000;

interface CoinGeckoSearchResult {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb?: string;
  large?: string;
}

interface CoinGeckoSearchResponse {
  coins?: CoinGeckoSearchResult[];
}

interface CoinGeckoTicker {
  base?: string;
  target?: string;
  market?: {
    name?: string;
    identifier?: string;
    has_trading_incentive?: boolean;
  };
  last?: number | null;
  volume?: number | null;
  converted_last?: { usd?: number | null };
  converted_volume?: { usd?: number | null };
  trust_score?: "green" | "yellow" | "red" | null;
  bid_ask_spread_percentage?: number | null;
  trade_url?: string | null;
  last_traded_at?: string | null;
  is_anomaly?: boolean;
  is_stale?: boolean;
}

interface CoinGeckoTickersResponse {
  name?: string;
  tickers?: CoinGeckoTicker[];
}

async function cgFetch(path: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "web3-research-mcp",
  };
  if (COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = COINGECKO_API_KEY;
  }

  // AbortController rather than AbortSignal.timeout() so the AbortError can be
    // distinguished and rewritten into an explicit timeout message below.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COINGECKO_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${COINGECKO_BASE}${path}`, {
      headers,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(
        `CoinGecko request timed out after ${COINGECKO_TIMEOUT_MS}ms`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    throw new Error(
      "CoinGecko rate limit hit (429). Free tier allows ~30 req/min — wait a minute and retry."
    );
  }

  if (!response.ok) {
    throw new Error(
      `CoinGecko API error ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

interface ResolveCoinResult {
  coin: CoinGeckoSearchResult;
  ambiguous: boolean;
  candidateCount: number;
  matchedOn: string;
  query: string;
}

// CoinGecko convention: lower market_cap_rank = bigger token. Null ranks
// (unranked coins) sort last. Mirrors DeFiLlama's `pickHighestTvl` so both
// resolvers break ticker/name ties the same way.
function pickBestRank(
  candidates: CoinGeckoSearchResult[]
): CoinGeckoSearchResult {
  return [...candidates].sort((a, b) => {
    const ra = a.market_cap_rank ?? Number.POSITIVE_INFINITY;
    const rb = b.market_cap_rank ?? Number.POSITIVE_INFINITY;
    return ra - rb;
  })[0];
}

async function resolveCoinId(
  tokenName: string,
  tokenTicker: string
): Promise<ResolveCoinResult | null> {
  const queries = [tokenTicker, tokenName].filter(Boolean);

  for (const query of queries) {
    const data = (await cgFetch(
      `/search?query=${encodeURIComponent(query)}`
    )) as CoinGeckoSearchResponse;

    const coins = data.coins ?? [];
    if (coins.length === 0) continue;

    const tickerUpper = tokenTicker.toUpperCase();
    const nameLower = tokenName.toLowerCase();

    if (tickerUpper) {
      const tickerMatches = coins.filter(
        (c) => c.symbol?.toUpperCase() === tickerUpper
      );
      if (tickerMatches.length > 0) {
        return {
          coin: pickBestRank(tickerMatches),
          ambiguous: tickerMatches.length > 1,
          candidateCount: tickerMatches.length,
          matchedOn: `symbol "${tickerUpper}"`,
          query,
        };
      }
    }

    if (nameLower) {
      const nameMatches = coins.filter(
        (c) => c.name?.toLowerCase() === nameLower
      );
      if (nameMatches.length > 0) {
        return {
          coin: pickBestRank(nameMatches),
          ambiguous: nameMatches.length > 1,
          candidateCount: nameMatches.length,
          matchedOn: `name "${tokenName}"`,
          query,
        };
      }
    }

    // No exact match — fall back to CoinGecko's own relevance ordering.
    return {
      coin: coins[0],
      ambiguous: coins.length > 1,
      candidateCount: coins.length,
      matchedOn: `fuzzy match for "${query}"`,
      query,
    };
  }

  return null;
}

function formatMarketSummary(coin: any): string {
  const md = coin.market_data ?? {};
  const price = md.current_price?.usd;
  const mcap = md.market_cap?.usd;
  const vol = md.total_volume?.usd;
  const ath = md.ath?.usd;
  const atl = md.atl?.usd;
  const change24h = md.price_change_percentage_24h;
  const change7d = md.price_change_percentage_7d;
  const change30d = md.price_change_percentage_30d;
  const supply = md.circulating_supply;
  const maxSupply = md.max_supply;

  const fmt = (n: number | null | undefined, digits = 2): string =>
    n == null ? "n/a" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

  const pct = (n: number | null | undefined): string =>
    n == null ? "n/a" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  const platforms = coin.platforms ?? {};
  const contractLines = Object.entries(platforms)
    .filter(([, addr]) => addr && typeof addr === "string" && addr.length > 0)
    .map(([chain, addr]) => `  - ${chain}: ${addr}`)
    .join("\n");

  const links = coin.links ?? {};
  const homepage = (links.homepage ?? []).filter((u: string) => u)[0];
  const twitter = links.twitter_screen_name
    ? `https://twitter.com/${links.twitter_screen_name}`
    : undefined;
  const telegram = links.telegram_channel_identifier
    ? `https://t.me/${links.telegram_channel_identifier}`
    : undefined;
  const github = (links.repos_url?.github ?? [])[0];
  const subreddit = links.subreddit_url;

  const socialLines = [
    homepage ? `  - Website: ${homepage}` : null,
    twitter ? `  - Twitter: ${twitter}` : null,
    telegram ? `  - Telegram: ${telegram}` : null,
    github ? `  - GitHub: ${github}` : null,
    subreddit ? `  - Reddit: ${subreddit}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `# ${coin.name} (${(coin.symbol ?? "").toUpperCase()}) — CoinGecko`,
    coin.market_cap_rank ? `Rank: #${coin.market_cap_rank}` : null,
    "",
    "## Market",
    `- Price: $${fmt(price, 6)}`,
    `- Market cap: $${fmt(mcap, 0)}`,
    `- 24h volume: $${fmt(vol, 0)}`,
    `- 24h change: ${pct(change24h)}`,
    `- 7d change: ${pct(change7d)}`,
    `- 30d change: ${pct(change30d)}`,
    `- All-time high: $${fmt(ath, 6)}`,
    `- All-time low: $${fmt(atl, 6)}`,
    `- Circulating supply: ${fmt(supply, 0)}`,
    `- Max supply: ${maxSupply ? fmt(maxSupply, 0) : "uncapped"}`,
    "",
    "## Contracts",
    contractLines || "  (none listed)",
    "",
    "## Links",
    socialLines || "  (none listed)",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function formatTickersSummary(
  coinName: string,
  tickerSymbol: string,
  tickers: CoinGeckoTicker[],
  limit: number
): string {
  // Drop anomalies/stales (CoinGecko marks low-confidence prints), then sort
  // by 24h USD volume desc so the deepest venues land at the top.
  const cleaned = tickers
    .filter((t) => !t.is_anomaly && !t.is_stale)
    .filter((t) => typeof t.converted_volume?.usd === "number")
    .sort(
      (a, b) =>
        (b.converted_volume?.usd ?? 0) - (a.converted_volume?.usd ?? 0)
    );

  const totalVolume = cleaned.reduce(
    (sum, t) => sum + (t.converted_volume?.usd ?? 0),
    0
  );

  const fmtUsd = (n: number | null | undefined, digits = 0): string => {
    if (n == null || !isFinite(n)) return "n/a";
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
  };

  const top = cleaned.slice(0, limit);

  const trustGlyph = (t: CoinGeckoTicker["trust_score"]): string => {
    if (t === "green") return "🟢";
    if (t === "yellow") return "🟡";
    if (t === "red") return "🔴";
    return "⚪";
  };

  const rows = top.map((t) => {
    const pair = `${t.base ?? "?"}/${t.target ?? "?"}`;
    const exchange = t.market?.name ?? "unknown";
    const price = fmtUsd(t.converted_last?.usd, 6);
    const vol = fmtUsd(t.converted_volume?.usd, 0);
    const spread =
      typeof t.bid_ask_spread_percentage === "number"
        ? `${t.bid_ask_spread_percentage.toFixed(2)}%`
        : "n/a";
    const link = t.trade_url ? ` — [trade](${t.trade_url})` : "";
    return `  - ${trustGlyph(t.trust_score)} ${exchange} (${pair}): ${price} · 24h ${vol} · spread ${spread}${link}`;
  });

  const greenCount = cleaned.filter((t) => t.trust_score === "green").length;
  const yellowCount = cleaned.filter((t) => t.trust_score === "yellow").length;
  const redOrNullCount = cleaned.length - greenCount - yellowCount;

  return [
    `# ${coinName} (${tickerSymbol.toUpperCase()}) — CoinGecko exchange listings`,
    "",
    "## Summary",
    `- Active markets: ${cleaned.length} (showing top ${top.length} by 24h volume)`,
    `- Total reported 24h volume: ${fmtUsd(totalVolume, 0)}`,
    `- Trust score split: ${greenCount} green · ${yellowCount} yellow · ${redOrNullCount} red/unrated`,
    "",
    "## Top venues",
    rows.length > 0 ? rows.join("\n") : "  (no active non-stale markets)",
  ].join("\n");
}

export function registerCoinGeckoTools(
  server: McpServer,
  storage: ResearchStorage
): void {
  server.registerTool(
    "coingecko-data",
    {
      inputSchema: {
        tokenName: z
          .string()
          .describe("Full name of the token (e.g., 'Bitcoin')"),
        tokenTicker: z.string().describe("Ticker symbol (e.g., 'BTC')"),
      },
    },
    async ({ tokenName, tokenTicker }) => {
      storage.addLogEntry(
        `Fetching CoinGecko data for ${tokenName} (${tokenTicker})`
      );

      try {
        const resolved = await resolveCoinId(tokenName, tokenTicker);
        if (!resolved) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `CoinGecko: no coin found matching ${tokenName} (${tokenTicker})`,
              },
            ],
          };
        }

        const { coin: match, ambiguous, candidateCount, matchedOn } = resolved;

        const coin = await cgFetch(
          `/coins/${encodeURIComponent(
            match.id
          )}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=true&sparkline=false`
        );

        const summary = formatMarketSummary(coin);
        const ambiguityWarning = ambiguous
          ? `> ⚠️ ${candidateCount} coins matched on ${matchedOn}; showing highest-rank match (\`${match.id}\`). Use \`coingecko-search\` to disambiguate.\n\n`
          : "";
        const resourceId = `coingecko_${match.id}_${new Date().getTime()}`;

        storage.addToSection("resources", {
          [resourceId]: {
            url: `${COINGECKO_BASE}/coins/${match.id}`,
            format: "markdown",
            content: `${ambiguityWarning}${summary}`,
            title: `CoinGecko: ${coin.name} (${(coin.symbol ?? "").toUpperCase()})`,
            source: "CoinGecko",
            fetchedAt: new Date().toISOString(),
          },
        });

        storage.addToSection("marketData", {
          [match.id]: {
            id: match.id,
            symbol: coin.symbol,
            name: coin.name,
            market_cap_rank: coin.market_cap_rank,
            price_usd: coin.market_data?.current_price?.usd,
            market_cap_usd: coin.market_data?.market_cap?.usd,
            volume_24h_usd: coin.market_data?.total_volume?.usd,
            price_change_24h_pct: coin.market_data?.price_change_percentage_24h,
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
        storage.addLogEntry(`CoinGecko fetch failed: ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching CoinGecko data: ${error}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "coingecko-search",
    {
      inputSchema: {
        query: z
          .string()
          .describe(
            "Search query — name, ticker, or contract address. Returns candidate CoinGecko IDs."
          ),
      },
    },
    async ({ query }) => {
      storage.addLogEntry(`CoinGecko search: "${query}"`);

      try {
        const data = (await cgFetch(
          `/search?query=${encodeURIComponent(query)}`
        )) as CoinGeckoSearchResponse;

        const coins = (data.coins ?? []).slice(0, 10);

        if (coins.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No CoinGecko matches for "${query}"`,
              },
            ],
          };
        }

        const lines = coins.map(
          (c) =>
            `- ${c.name} (${c.symbol?.toUpperCase()}) — id: \`${c.id}\`${
              c.market_cap_rank ? ` — rank #${c.market_cap_rank}` : ""
            }`
        );

        return {
          content: [
            {
              type: "text",
              text: `CoinGecko matches for "${query}":\n\n${lines.join(
                "\n"
              )}\n\nUse \`coingecko-data\` with the matching name/ticker for full details.`,
            },
          ],
        };
      } catch (error) {
        storage.addLogEntry(`CoinGecko search failed: ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error searching CoinGecko: ${error}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "coingecko-tickers",
    {
      inputSchema: {
        tokenName: z
          .string()
          .describe("Full name of the token (e.g., 'Bitcoin')"),
        tokenTicker: z.string().describe("Ticker symbol (e.g., 'BTC')"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(15)
          .describe("How many top venues to return (sorted by 24h USD volume)"),
      },
    },
    async ({ tokenName, tokenTicker, limit }) => {
      storage.addLogEntry(
        `Fetching CoinGecko tickers for ${tokenName} (${tokenTicker})`
      );

      try {
        const resolved = await resolveCoinId(tokenName, tokenTicker);
        if (!resolved) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `CoinGecko: no coin found matching ${tokenName} (${tokenTicker})`,
              },
            ],
          };
        }

        const { coin: match, ambiguous, candidateCount, matchedOn } = resolved;

        const data = (await cgFetch(
          `/coins/${encodeURIComponent(
            match.id
          )}/tickers?include_exchange_logo=false&order=volume_desc&depth=false`
        )) as CoinGeckoTickersResponse;

        const tickers = data.tickers ?? [];
        const summary = formatTickersSummary(
          match.name,
          match.symbol ?? tokenTicker,
          tickers,
          limit
        );
        const ambiguityWarning = ambiguous
          ? `> ⚠️ ${candidateCount} coins matched on ${matchedOn}; showing highest-rank match (\`${match.id}\`). Use \`coingecko-search\` to disambiguate.\n\n`
          : "";
        const resourceId = `coingecko_tickers_${match.id}_${new Date().getTime()}`;

        storage.addToSection("resources", {
          [resourceId]: {
            url: `${COINGECKO_BASE}/coins/${match.id}/tickers`,
            format: "markdown",
            content: `${ambiguityWarning}${summary}`,
            title: `CoinGecko tickers: ${match.name} (${(match.symbol ?? "").toUpperCase()})`,
            source: "CoinGecko",
            fetchedAt: new Date().toISOString(),
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
        storage.addLogEntry(`CoinGecko tickers fetch failed: ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching CoinGecko tickers: ${error}`,
            },
          ],
        };
      }
    }
  );
}
