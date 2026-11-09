import {
  search,
  searchNews,
  searchImages,
  searchVideos,
  SafeSearchType,
  type SearchResults,
  type NewsSearchResults,
  type ImageSearchResults,
  type VideoSearchResults,
} from "duck-duck-scrape";
import * as cheerio from "cheerio";
import { assertPublicHttpUrl, BlockedUrlError } from "./urlSafety.js";

const FETCH_CONTENT_TIMEOUT_MS = 15000;
/** Redirect hops followed per fetch; each hop is re-checked by the URL guard. */
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type SearchType = "web" | "news" | "images" | "videos";
export type ContentFormat = "text" | "html" | "markdown" | "json";

export type DdgSearchResults =
  | SearchResults
  | NewsSearchResults
  | ImageSearchResults
  | VideoSearchResults;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function performSearch(
  query: string,
  type: SearchType = "web",
  retries = 2
): Promise<DdgSearchResults> {
  try {
    await sleep(3000);

    const options = { safeSearch: SafeSearchType.MODERATE };

    let results: DdgSearchResults;
    switch (type) {
      case "news":
        results = await searchNews(query, options);
        break;
      case "images":
        results = await searchImages(query, options);
        break;
      case "videos":
        results = await searchVideos(query, options);
        break;
      default:
        results = await search(query, options);
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

/**
 * `fetch` that follows redirects by hand, so the first URL and every redirect
 * hop pass `assertPublicHttpUrl` (scheme + resolved-address check) first.
 */
async function fetchPublic(url: string, init: RequestInit): Promise<Response> {
  let target = await assertPublicHttpUrl(url);

  for (let hop = 0; ; hop++) {
    const response = await fetch(target, { ...init, redirect: "manual" });

    const location = response.headers.get("location");
    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      return response;
    }

    await response.body?.cancel();
    if (hop >= MAX_REDIRECTS) {
      throw new BlockedUrlError(
        `Too many redirects (more than ${MAX_REDIRECTS})`
      );
    }
    target = await assertPublicHttpUrl(new URL(location, target).toString());
  }
}

export async function fetchContent(
  url: string,
  format: ContentFormat = "text",
  retries = 2
): Promise<string> {
  // Fail fast on a refused URL, before the politeness delay and retries.
  await assertPublicHttpUrl(url);

  for (let i = 0; i <= retries; i++) {
    // AbortController rather than AbortSignal.timeout() so the AbortError can be
    // distinguished and rewritten into an explicit timeout message below.
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      FETCH_CONTENT_TIMEOUT_MS
    );

    try {
      await sleep(1000 + Math.random() * 2000);

      const response = await fetchPublic(url, {
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
        signal: controller.signal,
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
    } catch (error) {
      if (error instanceof BlockedUrlError) throw error;
      const wrapped =
        error instanceof Error && error.name === "AbortError"
          ? new Error(
              `Request to ${url} timed out after ${FETCH_CONTENT_TIMEOUT_MS}ms`
            )
          : error;
      if (i < retries) {
        console.error(
          `fetchContent attempt ${i + 1}/${retries + 1} for ${url} failed: ${wrapped}`
        );
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

/** Expands a source key into extra query terms; "news" routes to DDG news search. */
export async function searchSource(
  tokenName: string,
  tokenTicker: string,
  source: string
): Promise<DdgSearchResults> {
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
  }

  const query = `${tokenName} ${tokenTicker} ${source} ${extraTerms.join(" ")}`;

  if (source.toLowerCase() === "news") {
    return performSearch(query, "news");
  }

  return performSearch(query, "web");
}
