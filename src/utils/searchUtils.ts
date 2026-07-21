import * as DDG from "duck-duck-scrape";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const FETCH_CONTENT_TIMEOUT_MS = 15000;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function performSearch(
  query: string,
  type: "web" | "news" | "images" | "videos" = "web",
  retries = 2
): Promise<any> {
  try {
    await sleep(3000);

    let results;
    switch (type) {
      case "news":
        if (typeof DDG.news !== "function") {
          results = await DDG.search(`${query} news`, {
            safeSearch: DDG.SafeSearchType.MODERATE,
          });
        } else {
          results = await DDG.news(query);
        }
        break;
      case "images":
        if (typeof DDG.images !== "function") {
          results = await DDG.search(`${query} images`, {
            safeSearch: DDG.SafeSearchType.MODERATE,
          });
        } else {
          results = await DDG.images(query);
        }
        break;
      case "videos":
        if (typeof DDG.videos !== "function") {
          results = await DDG.search(`${query} videos`, {
            safeSearch: DDG.SafeSearchType.MODERATE,
          });
        } else {
          results = await DDG.videos(query);
        }
        break;
      default:
        results = await DDG.search(query, {
          safeSearch: DDG.SafeSearchType.MODERATE,
        });
    }

    return results;
  } catch (error) {
    if (retries > 0 && String(error).includes("anomaly")) {
      await sleep(10000);
      return performSearch(query, type, retries - 1);
    }
    throw error;
  }
}

export async function fetchContent(
  url: string,
  format: "text" | "html" | "markdown" | "json" = "text",
  retries = 2
): Promise<string> {
  if (url.startsWith("research://")) {
    throw new Error("Only HTTP(S) protocols are supported");
  }

  for (let i = 0; i <= retries; i++) {
    // node-fetch v2 doesn't support AbortSignal.timeout(); use AbortController.
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      FETCH_CONTENT_TIMEOUT_MS
    );

    try {
      await sleep(1000 + Math.random() * 2000);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          Referer: "https://www.google.com/",
          "Cache-Control": "max-age=0",
          "sec-ch-ua":
            '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
        },
        redirect: "follow",
        signal: controller.signal as any,
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error ${response.status}: ${response.statusText}`
        );
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const json = await response.json();
        return format === "json"
          ? JSON.stringify(json, null, 2)
          : JSON.stringify(json);
      } else {
        const html = await response.text();

        switch (format) {
          case "html":
            return html;
          case "markdown":
            const $ = cheerio.load(html);
            $("script, style, meta, link, noscript, iframe").remove();
            const title = $("title").text();
            const body = $("body").text().replace(/\s+/g, " ").trim();
            return `# ${title}\n\n${body}`;
          case "text":
          default:
            const $text = cheerio.load(html);
            $text("script, style, meta, link").remove();
            return $text("body").text().replace(/\s+/g, " ").trim();
        }
      }
    } catch (error: any) {
      const wrapped =
        error?.name === "AbortError"
          ? new Error(
              `Request to ${url} timed out after ${FETCH_CONTENT_TIMEOUT_MS}ms`
            )
          : error;
      if (i < retries) {
        const delay = 3000 * Math.pow(2, i);
        await sleep(delay);
      } else {
        throw wrapped;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

/**
 * Get search results for a specific source - completely open approach with additional search terms
 */
export async function searchSource(
  tokenName: string,
  tokenTicker: string,
  source: string
): Promise<any> {
  const extraTerms = ["crypto", "token"];

  switch (source.toLowerCase()) {
    case "coinmarketcap":
      extraTerms.push("price", "market", "chart");
      break;
    case "docs":
      extraTerms.push("documentation", "whitepaper", "github");
      break;
    case "vesting":
      extraTerms.push("tokenomics", "schedule", "unlock");
      break;
    case "raise":
      extraTerms.push("funding", "investment", "ico", "seed");
      break;
    case "news":
      extraTerms.push("latest", "announcement", "update");
      break;
    case "crypto token":
    case "dashboard":
    case "iq wiki":
    case "dune":
      extraTerms.push("dashboard", "crypto", "stats");
      break;
    case "airdrop":
      break;
    default:
  }

  const query = `${tokenName} ${tokenTicker} ${source} ${extraTerms.join(" ")}`;

  if (source.toLowerCase() === "news") {
    return performSearch(query, "news");
  }

  return performSearch(query, "web");
}
