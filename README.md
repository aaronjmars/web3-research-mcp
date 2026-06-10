# Web3 Research MCP
[![smithery badge](https://smithery.ai/badge/@aaronjmars/web3-research-mcp)](https://smithery.ai/server/@aaronjmars/web3-research-mcp)

Deep Research for crypto - free & fully local 🧠

<a href="https://glama.ai/mcp/servers/@aaronjmars/web3-research-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@aaronjmars/web3-research-mcp/badge" alt="Web3 Research MCP server" />
</a>

## 🚀 Preview

![Preview](https://i.imgur.com/b9WfMSk.png)
![Preview2](https://i.imgur.com/qjqvwmr.png)

## 🧠 Features

- **Comprehensive Research**: Gather detailed information about any cryptocurrency token
- **Multi-Source Analysis**: Research across multiple sources including CoinGecko, CoinMarketCap, DeFiLlama, and more
- **Structured Reporting**: Generate detailed reports covering technical fundamentals, market data, social sentiment, and more
- **Resource Management**: Automatically stores search results and content for reference
- **Status Tracking**: Track research progress through different stages and sections

## 📋 Requirements

- Node.js (v16 or higher)

## 🔧 Installation & Setup

### Installing via Smithery

To install web3-research-mcp for Claude Desktop automatically via [Smithery](https://smithery.ai/server/web3-research-mcp):

```bash
npx -y @smithery/cli install web3-research-mcp --client claude
```

## 🔌 Using with Claude Desktop

Edit your Claude Desktop config file

- Windows: %APPDATA%\Claude\claude_desktop_config.json
- macOS: ~/Library/Application Support/Claude/claude_desktop_config.json

Add this to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "web3-research-mcp": {
      "command": "npx",
      "args": ["-y", "web3-research-mcp@latest"]
    }
  }
}
```

Then restart Claude Desktop

## 🔌 Using with Cursor

Go to: Settings -> Cursor Settings -> MCP -> Add new global MCP server
Paste this into your Cursor ~/.cursor/mcp.json file. See Cursor MCP docs for more info.

```json
{
  "mcpServers": {
    "web3-research-mcp": {
      "command": "npx",
      "args": ["-y", "web3-research-mcp@latest"]
    }
  }
}
```

Then restart Cursor

## 🛠️ Tools

### create-research-plan

Creates a structured research plan for a token.

Parameters:
- tokenName: Full name of the token
- tokenTicker: Ticker symbol of the token

### search

Performs a web search and returns the results.

Parameters:
- query: Search query
- searchType: Type of search (web, news, images, videos)

### research-with-keywords

Searches for a token with specific keywords and saves the results.

Parameters:
- tokenName: Name of the token
- tokenTicker: Ticker symbol
- keywords: Array of keywords to search for

### update-status

Updates the status of a research section.

Parameters:
- section: Section name to update (e.g., 'projectInfo', 'technicalFundamentals')
- status: New status for the section (planned, in_progress, completed)

### fetch-content

Fetches content from a URL and saves it as a resource.

Parameters:
- url: URL to fetch content from
- format: Output format (text, html, markdown, json)

### list-resources

Lists all available resources that have been saved.

### search-source

Searches for information about a token from a specific source.

Parameters:
- tokenName: Name of the token
- tokenTicker: Ticker symbol
- source: Source to search (e.g., 'CoinGecko', 'DeFiLlama', 'News')

### coingecko-data

Fetches live market data directly from the CoinGecko public API — price, market cap, 24h/7d/30d changes, ATH/ATL, circulating supply, contract addresses across chains, and social/dev links. Bypasses the 403 issues of HTML scraping.

Parameters:
- tokenName: Full name of the token (e.g., 'Bitcoin')
- tokenTicker: Ticker symbol (e.g., 'BTC')

No API key required. Uses the free public tier (~30 req/min).

Optional: set `COINGECKO_API_KEY` in the environment to use a CoinGecko Pro API key. When set, requests are sent to `https://pro-api.coingecko.com/api/v3` with the `x-cg-pro-api-key` header. Requests time out after 15s.

### coingecko-search

Searches CoinGecko's coin index and returns candidate matches with their CoinGecko IDs. Useful when the ticker is ambiguous (e.g., multiple tokens with the same symbol).

Parameters:
- query: Search query — name, ticker, or contract address

### coingecko-tickers

Fetches active exchange listings for a token from CoinGecko — which CEXs/DEXs trade the pair, per-venue 24h USD volume, last price, bid-ask spread, trust score, and trade URL. Sorted by 24h USD volume desc; anomalies and stale prints are filtered out. Bypasses HTML scraping for the "where does this token actually trade" question.

Parameters:
- tokenName: Full name of the token (e.g., 'Bitcoin')
- tokenTicker: Ticker symbol (e.g., 'BTC')
- limit: How many top venues to return (default 15, max 50)

No API key required. Uses the free public tier. Requests time out after 15s.

### defillama-data

Fetches protocol data directly from the DeFiLlama public API — total TVL, ATH TVL with date, 30/90/365-day TVL change vs current, market cap, per-chain TVL breakdown, fees (24h/7d/30d/all-time), token addresses, fundraising rounds, and links. Bypasses HTML scraping for the most common DeFi-protocol lookup.

Parameters:
- tokenName: Full protocol/token name (e.g., 'Uniswap')
- tokenTicker: Ticker symbol (e.g., 'UNI')

No API key required. Uses the free public API. Requests time out after 15s. The protocol index is cached for 5 minutes per process to avoid hammering `/protocols` on every call.

### defillama-search

Searches DeFiLlama's protocol index and returns candidate matches with their slugs, TVL, and category. Useful when the ticker is ambiguous (e.g., multiple protocols with similar names).

Parameters:
- query: Search query — protocol name, ticker, or slug

## 📝 Prompts

### token-research

Initiates comprehensive research on a cryptocurrency token.

Parameters:
- tokenName: Full name of the cryptocurrency token
- tokenTicker: Ticker symbol of the token (e.g., BTC, ETH)

## 🧠 How It Works

1. When research begins, a structured plan is created covering all aspects of the token
2. The server performs searches across multiple sources for information
3. Search results are stored as resources that can be referenced
4. The research progresses through different sections, with status tracking
5. A comprehensive report is generated covering all aspects of the token

## ⚠️ Limitations

- Some websites block web scraping, so direct content fetching may fail with 403 errors
- Relies on search results which may not always be comprehensive
- Rate limits may apply to search operations

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
