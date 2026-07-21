import * as fs from "fs/promises";
import * as path from "path";

export interface ResearchLog {
  timestamp: string;
  message: string;
}

export interface ResearchPlan {
  [key: string]: {
    description: string;
    sources: string[];
    status: "planned" | "in_progress" | "completed";
  };
}

export interface ResearchData {
  tokenName: string;
  tokenTicker: string;
  researchPlan: ResearchPlan;
  searchResults: Record<string, any>;
  technicalData: Record<string, any>;
  marketData: Record<string, any>;
  socialData: Record<string, any>;
  newsData: Array<any>;
  teamData: Record<string, any>;
  relatedTokens: Array<any>;
  resources: Record<
    string,
    {
      url: string;
      format: string;
      content: string;
      fetchedAt: string;
    }
  >;
  researchData: Record<string, any>;
  status: "not_started" | "in_progress" | "completed";
  logs: ResearchLog[];
}

/** A fresh, fully-zeroed ResearchData record. */
function emptyResearch(
  tokenName: string,
  tokenTicker: string,
  status: ResearchData["status"]
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
    data: Partial<ResearchData[K]> | any
  ): void {
    const currentSection = this.currentResearch[section];

    if (Array.isArray(currentSection)) {
      (this.currentResearch[section] as any[]).push(data);
      this.addLogEntry(`Added item to section: ${section as string}`);
    } else if (typeof currentSection === "object" && currentSection !== null) {
      this.currentResearch[section] = {
        ...(currentSection as object),
        ...(data as object),
      } as ResearchData[K];
      this.addLogEntry(`Updated object section: ${section as string}`);
    } else {
      this.addLogEntry(
        `Error: Section ${section as string} has unsupported type`
      );
    }
  }

  getResource(resourceId: string): any {
    return this.currentResearch.resources[resourceId] || null;
  }

  getAllResources(): Record<string, any> {
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
