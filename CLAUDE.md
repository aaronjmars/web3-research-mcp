# CLAUDE.md

Guidance for AI agents (Claude Code and others) working in this repository.

## What this is

`web3-research-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server that gives an AI client (Claude Desktop, Cursor, etc.) a toolset for
deep, free, and fully local crypto research — web search plus direct CoinGecko
and DeFiLlama API access, with results stored as referenceable MCP resources.

It runs over **stdio** as a single Node process. There is no database and no
network service to stand up: the client launches it via `npx web3-research-mcp`
and talks to it on stdin/stdout.

## Stack

- **TypeScript** (ESM, `"type": "module"`), compiled with `tsc` to `dist/`.
- **`@modelcontextprotocol/sdk`** — `McpServer` + `StdioServerTransport`.
- **`zod`** — tool/prompt input schemas.
- **`duck-duck-scrape`** — web/news/image/video search (no API key).
- **`node-fetch` + `cheerio` + `turndown`** — fetch and convert page content.
- Node **>= 16** (CI builds on 20.x and 22.x).

## Build & run

```bash
npm ci            # install (use this in CI / clean checkouts)
npm run build     # tsc -> dist/
npm start         # node dist/server.js   (talks MCP over stdio)
npm run dev       # build + start
```

There is **no test suite and no linter** configured. CI
(`.github/workflows/ci.yml`) is the source of truth for "does it pass": it runs
`npm ci` → `npm run build` → asserts `dist/server.js` exists → `node --check
bin/cli.js` → `node bin/cli.js --help`. Before opening a PR, run `npm run build`
locally and make sure it's clean — `tsc` runs with `strict: true`, so type
errors fail the build.

## Layout

```
bin/cli.js                  npx entrypoint — spawns dist/server.js over stdio
src/server.ts               wires up McpServer: resources, the token-research prompt,
                            then calls registerAllTools()
src/tools/index.ts          registerAllTools() -> research + coingecko + defillama
src/tools/researchTools.ts  search, fetch-content, research-with-keywords,
                            create-research-plan, update-status, list-resources, ...
src/tools/coinGeckoTool.ts  coingecko-data / coingecko-search / coingecko-tickers
src/tools/defiLlamaTool.ts  defillama-data / defillama-search
src/utils/searchUtils.ts    performSearch / fetchContent / searchSource (DDG + fetch)
src/storage/researchStorage.ts  in-memory + on-disk research state and resources
src/types/                  shared TypeScript types
```

## How it fits together

1. The client invokes the `token-research` prompt (or calls tools directly).
2. `create-research-plan` seeds a structured plan in `ResearchStorage`.
3. Search/fetch tools gather data; each saved page becomes a **resource**
   addressable at `research://resource/{id}`.
4. `update-status` advances each section (`planned → in_progress → completed`).
5. Live state is exposed as MCP resources: `research://status`, `research://plan`,
   `research://logs`, `research://resources`, `research://data`.

`ResearchStorage` (instantiated in `server.ts` with `./research_data`) owns all
state. Tools receive the shared `storage` instance — don't create a second one.

## Adding or changing a tool

Tools are registered with `server.tool(name, zodSchema, handler)` inside a
`register*Tools(server, storage)` function. To add one:

1. Add the `server.tool(...)` call to the appropriate `register*Tools` function
   in `src/tools/` (or a new file wired through `src/tools/index.ts`).
2. Define inputs with `zod` and `.describe()` every field — the descriptions are
   what the model sees, so make them precise.
3. Return MCP content: `{ content: [{ type: "text", text: ... }] }`.
4. Document the tool in `README.md` under **🛠️ Tools** — keep the format,
   parameter list, and any API-key/rate-limit notes consistent with the
   existing entries.
5. `npm run build` and confirm `tsc` is clean.

## Conventions & gotchas

- **ESM import extensions are required.** Imports of local files use `.js`
  (e.g. `import ResearchStorage from "../storage/researchStorage.js"`) even
  though the source is `.ts`. This is `NodeNext` resolution — keep it.
- **`strict: true`** is on (`noImplicitAny` is relaxed to `false`). New code
  should still be typed; lean on the types in `src/types/`.
- **External fetches can fail and that's expected.** Some sites return 403 to
  scrapers. Network calls in `searchUtils.ts` use a 15s timeout
  (`FETCH_CONTENT_TIMEOUT_MS`) and retry/backoff — preserve those guards; prefer
  the CoinGecko/DeFiLlama API tools over HTML scraping when an equivalent exists.
- **No API keys are required.** CoinGecko honors an optional `COINGECKO_API_KEY`
  (Pro tier); everything else uses free public endpoints. Never hardcode a key
  and never log one.
- **stdio is the protocol channel.** `stdout` is reserved for MCP traffic — use
  `console.error` (stderr) for diagnostics, never `console.log`.
- **License: MIT.** Keep `package.json`, `README.md`, and `LICENSE` in agreement.

## Scope for autonomous changes

Good, low-risk contributions: new source-specific data tools, better error
handling/timeouts on fetches, type tightening, README/tool-doc accuracy, build
hygiene. Keep PRs focused — one change per PR — and make sure `npm run build`
stays green.
