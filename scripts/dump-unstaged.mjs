#!/usr/bin/env node
/**
 * Dump unstaged changes only: writes git diff (working tree) to unstaged-changes.md on Desktop.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const desktop = path.join(os.homedir(), 'Desktop');
const outPath = path.join(desktop, 'unstaged-changes.md');

const diff = execSync('git diff', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const content = [
  '# Unstaged Changes\n',
  '```diff\n',
  diff || '(no unstaged changes)\n',
  '```\n',
].join('');

fs.writeFileSync(outPath, content, 'utf8');
console.log(`Wrote ${outPath}`);
