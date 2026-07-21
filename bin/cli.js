#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, '../dist/server.js');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  // Safe on stdout: the server has not spawned, so no MCP session exists yet.
  console.log(`web3-research-mcp — deep crypto research over the Model Context Protocol

Usage: web3-research-mcp [options]

Options:
  -h, --help     Show this help and exit
  -v, --version  Print the version and exit

Runs an MCP server over stdio. It is normally launched by an MCP client
(Claude Desktop, Cursor, ...) rather than invoked directly; running it in a
terminal will just wait on stdin for protocol traffic.

Environment:
  COINGECKO_API_KEY  Optional CoinGecko Pro key. Free public endpoints are
                     used when unset.

Docs: https://github.com/aaronjmars/web3-research-mcp`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, '../package.json'), 'utf8')
  );
  console.log(pkg.version);
  process.exit(0);
}

const server = spawn('node', [serverPath, ...args], { stdio: 'inherit' });

process.on('SIGINT', () => {
  server.kill('SIGINT');
});