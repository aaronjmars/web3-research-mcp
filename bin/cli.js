#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, '../dist/server.js');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.exit(0);
}

const server = spawn('node', [serverPath, ...args], { stdio: 'inherit' });

process.on('SIGINT', () => {
  server.kill('SIGINT');
});