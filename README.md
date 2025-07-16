[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/aaronjmars-web3-research-mcp-badge.png)](https://mseep.ai/app/aaronjmars-web3-research-mcp)

# Web3 Research MCP
[![smithery badge](https://smithery.ai/badge/web3-research-mcp)](https://smithery.ai/server/web3-research-mcp)

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

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.
