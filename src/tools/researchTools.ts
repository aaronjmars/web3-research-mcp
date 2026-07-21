import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";
import ResearchStorage from "../storage/researchStorage.js";
import {
  performSearch,
  fetchContent,
  searchSource,
  sleep,
} from "../utils/searchUtils.js";

async function getResourceContent(
  url: string,
  storage: ResearchStorage
): Promise<string> {
  if (url.startsWith("research://resource/")) {
    const resourceId = url.replace("research://resource/", "");
    const resource = storage.getResource(resourceId);

    if (!resource) {
      throw new Error(`Resource not found: ${resourceId}`);
    }

    return resource.content;
  }

  return fetchContent(url, "markdown");
}

export function registerResearchTools(
  server: McpServer,
  storage: ResearchStorage
): void {
  // The MCP SDK 1.9.0 is typed against zod v3; with zod v4 installed we build
  // schemas via zod's v3 compatibility entrypoint ("zod/v3"). Register through a
  // non-generic alias so the SDK's tool<Args extends ZodRawShape> overload does
  // not trigger excessively deep type instantiation across the two zod copies.
  const tool = server.tool.bind(server) as (
    name: string,
    paramsSchema: z.ZodRawShape,
    cb: (args: any) => CallToolResult | Promise<CallToolResult>
  ) => void;

  tool(
    "search",
    {
      query: z.string().describe("Search query"),
      searchType: z
        .enum(["web", "news", "images", "videos"])
        .default("web")
        .describe("Type of search"),
    },
    async ({ query, searchType }: { query: string; searchType: string }) => {
      storage.addLogEntry(`Performing ${searchType} search for: "${query}"`);

      try {
        const results = await performSearch(query, searchType as any);

        storage.addToSection("searchResults", {
          [searchType]: {
            [query]: results,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `Search results for "${query}" (${searchType}):\n\n${JSON.stringify(
                results.results ? results.results.slice(0, 5) : [],
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error) {
        storage.addLogEntry(`Error searching for "${query}": ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error performing search: ${error}`,
            },
          ],
        };
      }
    }
  );

  tool(
    "create-research-plan",
    {
      tokenName: z.string().describe("Token name"),
      tokenTicker: z.string().describe("Token ticker symbol"),
    },
    async ({
      tokenName,
      tokenTicker,
    }: {
      tokenName: string;
      tokenTicker: string;
    }) => {
      storage.addLogEntry(
        `Creating research plan for ${tokenName} (${tokenTicker})`
      );

      const researchPlan = {
        projectInfo: {
          description: "Gather basic information about the project",
          sources: ["Project website", "Documentation", "CoinMarketCap"],
          status: "planned" as const,
        },
        technicalFundamentals: {
          description: "Analyze the token's technical aspects",
          sources: ["Documentation", "GitHub", "IQ Wiki", "Token contract"],
          status: "planned" as const,
        },
        marketStatus: {
          description: "Evaluate current market performance",
          sources: ["CoinMarketCap", "TradingView", "GeckoTerminal"],
          status: "planned" as const,
        },
        listings: {
          description: "Find where the token is traded",
          sources: ["GeckoTerminal", "CoinMarketCap"],
          status: "planned" as const,
        },
        news: {
          description: "Gather recent news about the token",
          sources: ["Crypto news sites", "Twitter", "Medium"],
          status: "planned" as const,
        },
        community: {
          description: "Analyze the project's community",
          sources: ["Twitter", "Discord", "Telegram", "Reddit"],
          status: "planned" as const,
        },
        predictions: {
          description: "Collect price predictions and forecasts",
          sources: ["Analysis sites", "Expert opinions"],
          status: "planned" as const,
        },
        teamInfo: {
          description: "Research the team behind the project",
          sources: ["Project website", "LinkedIn", "Twitter"],
          status: "planned" as const,
        },
        relatedCoins: {
          description: "Identify tokens in the same category",
          sources: ["GeckoTerminal", "CoinMarketCap"],
          status: "planned" as const,
        },
        socialSentiment: {
          description: "Gauge social media sentiment",
          sources: ["Twitter", "Reddit", "Trading forums"],
          status: "planned" as const,
        },
      };

      storage.updateSection("researchPlan", researchPlan);

      return {
        content: [
          {
            type: "text",
            text: `Created research plan for ${tokenName} (${tokenTicker}):\n\n${JSON.stringify(
              researchPlan,
              null,
              2
            )}`,
          },
        ],
      };
    }
  );

  tool(
    "research-with-keywords",
    {
      tokenName: z.string().describe("Name of the token"),
      tokenTicker: z.string().describe("Ticker symbol of the token"),
      keywords: z.array(z.string()).describe("Keywords to search for"),
    },
    async ({
      tokenName,
      tokenTicker,
      keywords,
    }: {
      tokenName: string;
      tokenTicker: string;
      keywords: string[];
    }) => {
      storage.addLogEntry(
        `Researching ${tokenName} with keywords: ${keywords.join(", ")}`
      );

      try {
        const results: Record<string, any> = {};

        for (const keyword of keywords) {
          const query = `${tokenName} ${tokenTicker} ${keyword}`;
          storage.addLogEntry(`Searching for: ${query}`);

          await sleep(2000);
          const searchResults = await performSearch(query, "web");

          if (!searchResults.results || searchResults.results.length === 0) {
            results[keyword] = { error: "No results found" };
            continue;
          }

          const topResults = searchResults.results.slice(0, 3);
          results[keyword] = topResults;

          storage.addToSection("searchResults", { [keyword]: topResults });
        }

        const resourceId = `combined_search_${tokenName.toLowerCase()}_${new Date().getTime()}`;
        storage.addToSection("resources", {
          [resourceId]: {
            format: "json",
            content: JSON.stringify(results, null, 2),
            title: `Combined search results for ${tokenName}`,
            fetchedAt: new Date().toISOString(),
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `Completed searches for ${tokenName} with keywords: ${keywords.join(
                ", "
              )}\n\nResults saved as resource: research://resource/${resourceId}\n\nHighlights:\n${Object.entries(
                results
              )
                .map(([keyword, data]) => {
                  if (Array.isArray(data) && data.length > 0) {
                    return `- ${keyword}: ${data[0].title} (${data[0].url})`;
                  }
                  return `- ${keyword}: No results`;
                })
                .join("\n")}`,
            },
          ],
        };
      } catch (error) {
        storage.addLogEntry(`Error in keyword research: ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error performing keyword research: ${error}`,
            },
          ],
        };
      }
    }
  );

  tool(
    "update-status",
    {
      section: z
        .string()
        .describe(
          "Section name to update (e.g., 'projectInfo', 'technicalFundamentals')"
        ),
      status: z
        .enum(["planned", "in_progress", "completed"])
        .describe("New status for the section"),
    },
    async ({
      section,
      status,
    }: {
      section: string;
      status: "planned" | "in_progress" | "completed";
    }) => {
      try {
        const researchPlan = storage.getSection("researchPlan");
        if (!researchPlan || !researchPlan[section]) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Section '${section}' not found in research plan`,
              },
            ],
          };
        }

        const updatedSection = {
          ...researchPlan[section],
          status,
        };

        const updatedPlan = {
          ...researchPlan,
          [section]: updatedSection,
        };

        storage.updateSection("researchPlan", updatedPlan);
        storage.addLogEntry(`Updated status of ${section} to ${status}`);

        return {
          content: [
            {
              type: "text",
              text: `Updated status of '${section}' to '${status}'`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error updating status: ${error}`,
            },
          ],
        };
      }
    }
  );

  tool(
    "fetch-content",
    {
      url: z
        .string()
        .describe("URL to fetch content from (can be a resource:// URL)"),
      format: z
        .enum(["text", "html", "markdown", "json"])
        .default("markdown")
        .describe("Output format"),
    },
    async ({
      url,
      format,
    }: {
      url: string;
      format: "text" | "html" | "markdown" | "json";
    }) => {
      storage.addLogEntry(`Fetching content from: ${url} (format: ${format})`);

      try {
        let content;

        if (url.startsWith("research://resource/")) {
          content = await getResourceContent(url, storage);
        } else {
          content = await fetchContent(url, format);
        }

        const resourceId = url.startsWith("research://resource/")
          ? `derived_${url.replace(
              "research://resource/",
              ""
            )}_${new Date().getTime()}`
          : url
              .replace(/https?:\/\//, "")
              .replace(/[^\w]/g, "_")
              .substring(0, 30);

        storage.addToSection("resources", {
          [resourceId]: {
            url,
            format,
            content,
            fetchedAt: new Date().toISOString(),
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `Fetched content from ${url} (${format}):\n\n${content.substring(
                0,
                1000
              )}${
                content.length > 1000
                  ? "...\n\n[Content truncated, full version saved as resource]"
                  : ""
              }`,
            },
          ],
        };
      } catch (error) {
        storage.addLogEntry(`Error fetching content from ${url}: ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching content: ${error}`,
            },
          ],
        };
      }
    }
  );

  tool(
    "search-source",
    {
      tokenName: z.string().describe("Name of the token"),
      tokenTicker: z.string().describe("Ticker symbol of the token"),
      source: z
        .string()
        .describe("Source to search (e.g., 'Dune', 'IQ Wiki', 'News')"),
    },
    async ({
      tokenName,
      tokenTicker,
      source,
    }: {
      tokenName: string;
      tokenTicker: string;
      source: string;
    }) => {
      storage.addLogEntry(
        `Searching ${source} for ${tokenName} (${tokenTicker})`
      );

      try {
        const results = await searchSource(tokenName, tokenTicker, source);

        storage.addToSection("searchResults", {
          [source]: results,
        });

        let responseText = `Search results for ${source} about ${tokenName} (${tokenTicker}):\n\n`;

        if (results.results && results.results.length > 0) {
          const topResults = results.results.slice(0, 5);
          responseText += JSON.stringify(topResults, null, 2);

          if (topResults[0] && topResults[0].url) {
            const url = topResults[0].url;
            responseText += `\n\nFetching content from top result: ${url}`;

            try {
              await sleep(3000);

              const content = await fetchContent(url, "text");
              const resourceId = `${source.toLowerCase()}_${tokenName.toLowerCase()}_${new Date().getTime()}`;

              storage.addToSection("resources", {
                [resourceId]: {
                  url,
                  format: "text",
                  content,
                  source,
                  fetchedAt: new Date().toISOString(),
                },
              });

              responseText += `\n\nContent has been saved as a resource. Use 'research://resource/${resourceId}' to access it.`;
            } catch (fetchError) {
              responseText += `\n\nCould not fetch content from URL: ${fetchError}`;
            }
          }
        } else {
          responseText += `No results found.`;
        }

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error) {
        storage.addLogEntry(`Error searching ${source}: ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error searching ${source}: ${error}`,
            },
          ],
        };
      }
    }
  );

  tool("list-resources", {}, async () => {
    try {
      const resources = storage.getAllResources();
      const resourceList = Object.keys(resources).map((id) => ({
        id,
        url: resources[id].url,
        title: resources[id].title || "No title",
        source: resources[id].source || "Unknown",
        contentLength: resources[id].content?.length || 0,
        fetchedAt: resources[id].fetchedAt,
      }));

      return {
        content: [
          {
            type: "text",
            text: `Available resources:\n\n${JSON.stringify(
              resourceList,
              null,
              2
            )}`,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error listing resources: ${error}`,
          },
        ],
      };
    }
  });

  tool(
    "research-source",
    {
      tokenName: z.string().describe("Name of the token"),
      tokenTicker: z.string().describe("Ticker symbol of the token"),
      source: z
        .string()
        .describe("Source to research (e.g., 'IQ Wiki', 'CoinMarketCap')"),
    },
    async ({
      tokenName,
      tokenTicker,
      source,
    }: {
      tokenName: string;
      tokenTicker: string;
      source: string;
    }) => {
      storage.addLogEntry(
        `Researching source: ${source} for ${tokenName} (${tokenTicker})`
      );

      try {
        const query = `${tokenName} ${tokenTicker} ${source}`;

        const results = await performSearch(query, "web");

        if (!results.results || results.results.length === 0) {
          storage.addLogEntry(`No results found for ${source}`);
          return {
            content: [
              {
                type: "text",
                text: `No results found for ${source}`,
              },
            ],
          };
        }

        const topResults = results.results.slice(0, 3);
        storage.addToSection("searchResults", { [source]: topResults });

        if (topResults[0] && topResults[0].url) {
          try {
            const url = topResults[0].url;
            storage.addLogEntry(`Fetching content from ${url}`);
            const content = await fetchContent(url, "markdown");

            const resourceId = `${source.toLowerCase()}_${tokenName.toLowerCase()}_${new Date().getTime()}`;

            storage.addToSection("resources", {
              [resourceId]: {
                url,
                format: "markdown",
                content,
                title: topResults[0].title,
                source,
                fetchedAt: new Date().toISOString(),
              },
            });

            return {
              content: [
                {
                  type: "text",
                  text: `Researched ${source} for ${tokenName} (${tokenTicker}).\n\nTop result: ${
                    topResults[0].title
                  }\n\nContent saved as resource: research://resource/${resourceId}\n\nAll search results:\n${JSON.stringify(
                    topResults,
                    null,
                    2
                  )}`,
                },
              ],
            };
          } catch (error) {
            storage.addLogEntry(
              `Error fetching content from ${topResults[0].url}: ${error}`
            );
            return {
              content: [
                {
                  type: "text",
                  text: `Found search results for ${source}, but couldn't fetch content: ${error}\n\nSearch results:\n${JSON.stringify(
                    topResults,
                    null,
                    2
                  )}`,
                },
              ],
            };
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Search results for ${source}:\n\n${JSON.stringify(
                topResults,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error) {
        storage.addLogEntry(`Error researching ${source}: ${error}`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error researching ${source}: ${error}`,
            },
          ],
        };
      }
    }
  );
}
