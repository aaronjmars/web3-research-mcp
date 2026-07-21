import * as fs from "fs/promises";
import * as path from "path";

export interface ResearchLog {
  timestamp: string;
  message: string;
}

/** Lifecycle of a single section of the research plan. */
export type PlanStatus = "planned" | "in_progress" | "completed";

/** Lifecycle of the overall research run. */
export type ResearchStatus = "not_started" | "in_progress" | "completed";

export interface ResearchPlan {
  [key: string]: {
    description: string;
    sources: string[];
    status: PlanStatus;
  };
}

/**
 * A saved page/API response, addressable at `research://resource/{id}`.
 *
 * `url` is optional because `research-with-keywords` stores an aggregate of
 * several searches, which has no single source URL. `title` and `source` are
 * optional because the raw `fetch-content` path does not know either.
 */
export interface ResearchResource {
  url?: string;
  format: string;
  content: string;
  title?: string;
  source?: string;
  fetchedAt: string;
}

export interface ResearchData {
  tokenName: string;
  tokenTicker: string;
  researchPlan: ResearchPlan;
  // These sections hold arbitrary third-party payloads (DDG results, CoinGecko
  // and DeFiLlama JSON) and are only ever JSON.stringify'd back out, so
  // `unknown` is the honest element type.
  searchResults: Record<string, unknown>;
  technicalData: Record<string, unknown>;
  marketData: Record<string, unknown>;
  socialData: Record<string, unknown>;
  newsData: unknown[];
  teamData: Record<string, unknown>;
  relatedTokens: unknown[];
  resources: Record<string, ResearchResource>;
  researchData: Record<string, unknown>;
  status: ResearchStatus;
  logs: ResearchLog[];
}

/** A fresh, fully-zeroed ResearchData record. */
function emptyResearch(
  tokenName: string,
  tokenTicker: string,
  status: ResearchStatus
): ResearchData {
  return {
    tokenName,
    tokenTicker,
    researchPlan: {},
    searchResults: {},
    technicalData: {},
    marketData: {},
    socialData: {},
    newsData: [],
    teamData: {},
    relatedTokens: [],
    resources: {},
    researchData: {},
    status,
    logs: [],
  };
}

export class ResearchStorage {
  private dataDir: string;
  private currentResearch: ResearchData;

  constructor(dataDir: string = "./research_data") {
    this.dataDir = dataDir;
    this.ensureDataDir();

    this.currentResearch = emptyResearch("", "", "not_started");
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create data directory:", error);
    }
  }

  startNewResearch(tokenName: string, tokenTicker: string): void {
    if (this.currentResearch.status !== "not_started") {
      this.saveCurrentResearch();
    }

    this.currentResearch = emptyResearch(tokenName, tokenTicker, "in_progress");

    this.addLogEntry(`Started research on ${tokenName} (${tokenTicker})`);
  }

  getCurrentResearch(): ResearchData {
    return this.currentResearch;
  }

  getSection<K extends keyof ResearchData>(section: K): ResearchData[K] {
    return this.currentResearch[section];
  }

  updateSection<K extends keyof ResearchData>(
    section: K,
    data: ResearchData[K]
  ): void {
    this.currentResearch[section] = data;
    this.addLogEntry(`Updated section: ${section as string}`);
  }

  addToSection<K extends keyof ResearchData>(
    section: K,
    data: Partial<ResearchData[K]>
  ): void {
    const currentSection = this.currentResearch[section];

    if (Array.isArray(currentSection)) {
      (this.currentResearch[section] as unknown[]).push(data);
      this.addLogEntry(`Added item to section: ${section as string}`);
    } else if (typeof currentSection === "object" && currentSection !== null) {
      this.currentResearch[section] = {
        ...(currentSection as Record<string, unknown>),
        ...(data as Record<string, unknown>),
      } as ResearchData[K];
      this.addLogEntry(`Updated object section: ${section as string}`);
    } else {
      this.addLogEntry(
        `Error: Section ${section as string} has unsupported type`
      );
    }
  }

  getResource(resourceId: string): ResearchResource | null {
    return this.currentResearch.resources[resourceId] || null;
  }

  getAllResources(): Record<string, ResearchResource> {
    return this.currentResearch.resources;
  }

  addLogEntry(message: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
    };

    this.currentResearch.logs.push(logEntry);
  }

  completeResearch(): void {
    this.currentResearch.status = "completed";
    this.addLogEntry(`Completed research on ${this.currentResearch.tokenName}`);
    this.saveCurrentResearch();
  }

  async saveCurrentResearch(): Promise<void> {
    try {
      const filename = `${this.currentResearch.tokenTicker.toLowerCase()}_${new Date()
        .toISOString()
        .replace(/[:T.]/g, "_")}.json`;
      const filepath = path.join(this.dataDir, filename);

      await fs.writeFile(
        filepath,
        JSON.stringify(this.currentResearch, null, 2)
      );
    } catch (error) {
      console.error("Failed to save research data:", error);
    }
  }
}

export default ResearchStorage;
