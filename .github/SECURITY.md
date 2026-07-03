# Security Policy

Web3 Research MCP is a local, read-only MCP server that researches crypto tokens by
**fetching and scraping untrusted web content** (CoinGecko, CoinMarketCap,
DeFiLlama, DuckDuckGo, arbitrary result URLs) and handing it back to an LLM. It
needs no API keys and holds no funds, so the realistic risks are **prompt
injection from scraped content, outbound-request abuse (SSRF), and supply chain**
(it ships to npm, Smithery, and as a Docker image). This policy covers what's in
scope and how to report privately.

## Reporting a vulnerability

**Please don't open a public issue for a security problem.** Use GitHub's
**Private Vulnerability Reporting (PVR)** instead:

➡️ **[Report a vulnerability](https://github.com/aaronjmars/web3-research-mcp/security/advisories/new)**

(Repo → **Security** tab → **Report a vulnerability**.) This opens a private
advisory that only the maintainers can see — never a public issue, so a fix can
ship before the details are out.

Please include what you can:

- The tool or module affected (a research tool in `src/`, the fetch/scrape layer,
  the `bin/cli.js` entrypoint).
- A minimal reproduction or proof of concept — for injection, the source content
  that triggers it; for SSRF, the input that reaches an unintended host.
- The impact you can demonstrate — the server making requests to internal/
  unintended addresses, scraped content driving the client LLM to take unintended
  actions, resource exhaustion, or code execution.
- Node version and how you ran it (npx, local build, Docker, Smithery).

**Response targets** — best effort; this is a small project:

| Stage | Target |
|-------|--------|
| Acknowledge the report | within 7 days |
| Initial assessment / severity | within 14 days |
| Fix or mitigation on `main` + npm | as fast as the severity warrants |

We follow **coordinated disclosure**: please give us a reasonable window to ship a
fix before you disclose publicly. We'll credit you in the advisory unless you'd
rather stay anonymous.

## Supported versions

Security fixes land on the `main` branch of
[`aaronjmars/web3-research-mcp`](https://github.com/aaronjmars/web3-research-mcp)
and the latest
[`web3-research-mcp`](https://www.npmjs.com/package/web3-research-mcp) npm release.

| Version | Supported |
|---------|-----------|
| `main` / latest npm (1.0.x) | ✅ Yes |
| Older releases | ❌ No — update to latest |

## Security model

- **Runs locally, no secrets.** The server needs no API keys and stores no
  credentials. It's low-privilege by design — but it *does* make outbound requests
  and feed the results to an LLM.
- **Scraped content is untrusted data, not instructions.** Pages, search results,
  and API responses can contain prompt-injection attempts. The server should return
  them as research material; content that reliably steers the connected LLM into
  unintended actions is worth reporting (note the client model shares
  responsibility here).
- **Outbound requests are a surface.** The server fetches URLs derived from search
  results. Input that makes it request internal addresses, non-HTTP schemes, or
  otherwise abuse the fetch layer (SSRF) is in scope.
- **Supply chain matters.** The package is published to npm and Smithery and built
  into a Docker image via CI (`.github/workflows/publish.yml`). Issues in the
  release pipeline, dependency integrity, or the published artifacts are in scope.

## Scope

**In scope:**

- SSRF or fetch-layer abuse (requests to internal/unintended hosts or schemes).
- Prompt injection from scraped content that crosses into unintended tool use.
- Denial of service / resource exhaustion via crafted inputs or responses.
- Code execution, path traversal, or injection in the server or CLI.
- Supply-chain issues in the npm/Smithery/Docker release path.

**Out of scope:**

- The **accuracy** of research output — this tool aggregates public sources and
  makes no correctness guarantee; a wrong figure is a data issue, open a regular
  issue.
- Vulnerabilities in the upstream data sources, the MCP client, or the LLM —
  report those to the respective vendor.
- Rate-limiting or blocking by a scraped site (that's the site's policy).

---

> **Maintainers:** the Report-a-vulnerability link only works once PVR is enabled
> — **Settings → Code security and analysis → Private vulnerability reporting →
> Enable**.

Thanks for helping keep Web3 Research MCP safe.
