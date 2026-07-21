import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import ResearchStorage from "./storage/researchStorage.js";
import { registerAllTools } from "./tools/index.js";

const storage = new ResearchStorage("./research_data");

const server = new McpServer({
  name: "web3-research-mcp",
  version: "1.0.1",
});

server.resource("research-status", "research://status", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: JSON.stringify(
        {
          tokenName: storage.getCurrentResearch().tokenName,
          tokenTicker: storage.getCurrentResearch().tokenTicker,
          status: storage.getCurrentResearch().status,
        },
        null,
        2
      ),
      mimeType: "application/json",
    },
  ],
}));

server.resource("research-plan", "research://plan", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: JSON.stringify(storage.getCurrentResearch().researchPlan, null, 2),
      mimeType: "application/json",
    },
  ],
}));

server.resource("research-logs", "research://logs", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: storage
        .getCurrentResearch()
        .logs.map((log) => `[${log.timestamp}] ${log.message}`)
        .join("\n"),
      mimeType: "text/plain",
    },
  ],
}));

server.resource("resources-list", "research://resources", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: JSON.stringify(
        Object.keys(storage.getAllResources()).map((id) => ({
          id,
          url: storage.getAllResources()[id].url,
          format: storage.getAllResources()[id].format,
          source: storage.getAllResources()[id].source,
          fetchedAt: storage.getAllResources()[id].fetchedAt,
          contentLength: storage.getAllResources()[id].content?.length || 0,
        })),
        null,
        2
      ),
      mimeType: "application/json",
    },
  ],
}));

server.resource("research-data", "research://data", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: JSON.stringify(storage.getCurrentResearch().researchData, null, 2),
      mimeType: "application/json",
    },
  ],
}));

server.resource(
  "resource-content",
  new ResourceTemplate("research://resource/{id}", { list: undefined }),
  async (uri, variables) => {
    const id = variables.id as string;
    const resource = storage.getResource(id);

    if (!resource) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Resource not found: ${id}`,
            mimeType: "text/plain",
          },
        ],
      };
    }

    let mimeType = "text/plain";
    switch (resource.format) {
      case "html":
        mimeType = "text/html";
        break;
      case "markdown":
        mimeType = "text/markdown";
        break;
      case "json":
        mimeType = "application/json";
        break;
      default:
        mimeType = "text/plain";
    }

    return {
      contents: [
        {
          uri: uri.href,
          text: resource.content,
          mimeType,
        },
      ],
    };
  }
);

server.registerPrompt(
  "token-research",
  {
    argsSchema: {
      tokenName: z
        .string()
        .describe("The full name of the cryptocurrency token"),
      tokenTicker: z
        .string()
        .describe("The ticker symbol of the token (e.g., BTC, ETH)"),
    },
  },
  ({ tokenName, tokenTicker }) => {
    storage.startNewResearch(tokenName, tokenTicker);

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I need a comprehensive analysis of ${tokenName} (${tokenTicker}). 
            
Here's how to approach this research:

1. First, use the "create-research-plan" tool to establish a structured research plan.

2. For each section in your plan, use "update-status" to mark it as "in_progress" when you start investigating it, and "completed" when you're done.

3. To gather information without hitting website blocking issues, use:
   - The "search" tool for general searches
   - The "research-with-keywords" tool with relevant keywords like "price", "tvl", "docs", etc.

4. Build your report based on search results - don't worry about fetching detailed website content as many sites block scrapers.

Your report should cover:
- Project information
- Technical fundamentals
- Market status
- Exchange listings
- Recent news
- Community analysis
- Price predictions
- Team information
- Related tokens
- Social sentiment

For each section, explain what you discovered, what remains uncertain, and what needs further investigation.`,
          },
        },
      ],
    };
  }
);

registerAllTools(server, storage);

const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => {})
  .catch((error) => {
    console.error("Failed to start server:", error);
  });
