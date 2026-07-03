# Contributing to Web3 Research MCP

Thanks for helping improve Web3 Research MCP — a free, fully-local MCP server for
deep crypto research. It's a TypeScript MCP server with no API keys, so it's easy
to run and hack on. This guide covers setup and how to land a PR.

## Ways to contribute

- **New research sources or tools** in `src/` (a data source, a report section, a
  scrape target).
- **Bug fixes** in the fetch/scrape layer, tool logic, or the `bin/cli.js`
  entrypoint.
- **Robustness** — better handling of untrusted scraped content, timeouts, and
  malformed responses (see [`SECURITY.md`](SECURITY.md)).
- **Docs** — setup for a new MCP client, Smithery, or Docker.

## Before you start

- **Fork and branch from `main`.** Use a descriptive branch name (`feat/…`,
  `fix/…`, `docs/…`).
- **One change per PR.** Don't bundle unrelated edits.
- **Title as a [Conventional Commit](https://www.conventionalcommits.org/)** —
  `feat: …`, `fix: …`, `docs: …`. PRs are squash-merged, so the title becomes the
  commit subject.
- **Treat scraped content as untrusted.** New sources/tools should return fetched
  text as *data*, never let it steer control flow.

## Development setup

**Prerequisites:** Node.js 20+ (CI covers 20 and 22).

```bash
git clone https://github.com/aaronjmars/web3-research-mcp.git && cd web3-research-mcp
npm install
npm run build          # tsc → dist/
npm start              # run the server (stdio MCP)
```

`npm run dev` builds and starts in one step. To try it end to end, point an MCP
client (e.g. Claude Desktop) at `node dist/server.js`, or run the CLI directly:

```bash
node bin/cli.js --help
```

## Testing & CI

CI (`.github/workflows/ci.yml`) builds on Node 20 and 22 and smoke-tests the CLI.
Reproduce it locally before pushing:

```bash
npm ci
npm run build
test -f dist/server.js        # build output exists
node --check bin/cli.js       # CLI parses
node bin/cli.js --help        # CLI smoke test
```

Releases to npm/Smithery/Docker run from `.github/workflows/publish.yml` on tag —
don't publish by hand.

## Submitting a pull request

- Keep the diff focused and the title conventional; it becomes the squash commit.
- Explain **what** changed and **why**; link the issue (`Fixes #123`).
- `npm run build` is clean and the CLI smoke test passes locally.
- If you added an outbound-fetch path or a new scrape source, note it — those touch
  the SSRF / injection surface in [`SECURITY.md`](SECURITY.md).

## Reporting bugs & requesting features

Open an issue with the token/query you ran, the MCP client, your Node version, and
what you expected vs. what happened.

**Found a security problem** (SSRF, injection, a supply-chain issue)? Don't open an
issue — follow [`SECURITY.md`](SECURITY.md) and report it privately.

## License

By contributing, you agree that your contributions are licensed under the
repository's [LICENSE](LICENSE) (MIT).
