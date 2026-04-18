import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fetch from "node-fetch";
import ResearchStorage from "../storage/researchStorage.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

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

async function cgFetch(path: string): Promise<any> {
  const response = await fetch(`${COINGECKO_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "web3-research-mcp",
    },
  });

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

async function resolveCoinId(
  tokenName: string,
  tokenTicker: string
): Promise<CoinGeckoSearchResult | null> {
  const queries = [tokenTicker, tokenName].filter(Boolean);

  for (const query of queries) {
    const data = (await cgFetch(
      `/search?query=${encodeURIComponent(query)}`
    )) as CoinGeckoSearchResponse;

    const coins = data.coins ?? [];
    if (coins.length === 0) continue;

    const tickerUpper = tokenTicker.toUpperCase();
    const nameLower = tokenName.toLowerCase();

    const tickerMatch = coins.find(
      (c) => c.symbol?.toUpperCase() === tickerUpper
    );
    if (tickerMatch) return tickerMatch;

    const nameMatch = coins.find((c) => c.name?.toLowerCase() === nameLower);
    if (nameMatch) return nameMatch;

    return coins[0];
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

export function registerCoinGeckoTools(
  server: McpServer,
  storage: ResearchStorage
): void {
  server.tool(
    "coingecko-data",
    {
      tokenName: z.string().describe("Full name of the token (e.g., 'Bitcoin')"),
      tokenTicker: z.string().describe("Ticker symbol (e.g., 'BTC')"),
    },
    async ({
      tokenName,
      tokenTicker,
    }: {
      tokenName: string;
      tokenTicker: string;
    }) => {
      storage.addLogEntry(
        `Fetching CoinGecko data for ${tokenName} (${tokenTicker})`
      );

      try {
        const match = await resolveCoinId(tokenName, tokenTicker);
        if (!match) {
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

        const coin = await cgFetch(
          `/coins/${encodeURIComponent(
            match.id
          )}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=true&sparkline=false`
        );

        const summary = formatMarketSummary(coin);
        const resourceId = `coingecko_${match.id}_${new Date().getTime()}`;

        storage.addToSection("resources", {
          [resourceId]: {
            url: `${COINGECKO_BASE}/coins/${match.id}`,
            format: "markdown",
            content: summary,
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
              text: `${summary}\n\nSaved as resource: research://resource/${resourceId}`,
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

  server.tool(
    "coingecko-search",
    {
      query: z
        .string()
        .describe(
          "Search query — name, ticker, or contract address. Returns candidate CoinGecko IDs."
        ),
    },
    async ({ query }: { query: string }) => {
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
}
