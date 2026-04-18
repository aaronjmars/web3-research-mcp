import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import ResearchStorage from "../storage/researchStorage.js";
import { registerResearchTools } from "./researchTools.js";
import { registerCoinGeckoTools } from "./coinGeckoTool.js";

export function registerAllTools(
  server: McpServer,
  storage: ResearchStorage
): void {
  registerResearchTools(server, storage);
  registerCoinGeckoTools(server, storage);
}
