#!/usr/bin/env node
/**
 * Dump staged changes only: writes git diff --cached to staged-changes.md on Desktop.
 * Does not dump src or docs; use dump:project for that.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const desktop = path.join(os.homedir(), 'Desktop');
const outPath = path.join(desktop, 'staged-changes.md');

const diff = execSync('git diff --cached', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const content = [
  '# Staged Changes\n',
  '```diff\n',
  diff || '(no staged changes)\n',
  '```\n',
].join('');

fs.writeFileSync(outPath, content, 'utf8');
console.log(`Wrote ${outPath}`);
