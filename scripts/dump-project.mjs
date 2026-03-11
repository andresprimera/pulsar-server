#!/usr/bin/env node
/**
 * Dump project: writes current contents of src/ and docs/ to Desktop.
 * Each run re-scans directories and re-reads every file from disk (no cache).
 * Run `pnpm run dump:project` after changes to refresh the dump.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');
const docsRoot = path.join(repoRoot, 'docs');
const desktop = path.join(os.homedir(), 'Desktop');
const outPath = path.join(desktop, 'project-dump.md');

const SRC_EXTENSIONS = new Set(['.ts', '.js']);

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, out);
    } else if (entry.isFile() && predicate(full, entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (p) => path.relative(repoRoot, p);
const generatedAt = new Date().toISOString();
const lines = [
  '# Project dump\n',
  `Generated at **${generatedAt}** from current \`src/\` and \`docs/\` (files read from disk each run).\n`,
];

// --- src dump ---
const srcFiles = walk(srcRoot, (full, name) => SRC_EXTENSIONS.has(path.extname(name))).sort();
lines.push('\n---\n\n# Source (`src/`)\n');
lines.push(`(${srcFiles.length} files)\n`);

for (const file of srcFiles) {
  const relPath = rel(file);
  const ext = path.extname(file);
  const lang = ext === '.ts' ? 'ts' : 'js';
  lines.push(`\n## ${relPath}\n`);
  lines.push('```' + lang + '\n');
  try {
    const content = fs.readFileSync(file, 'utf8');
    lines.push(content);
  } catch (err) {
    lines.push(`(read error: ${err.message})\n`);
  }
  if (!lines[lines.length - 1].endsWith('\n')) lines.push('\n');
  lines.push('```\n');
}

// --- docs dump ---
const docsFiles = walk(docsRoot, () => true).sort();
lines.push('\n---\n\n# Documentation (`docs/`)\n');
lines.push(`(${docsFiles.length} files)\n`);

for (const file of docsFiles) {
  const relPath = rel(file);
  const ext = path.extname(file);
  const lang = ext === '.md' ? 'markdown' : ext.slice(1) || 'text';
  lines.push(`\n## ${relPath}\n`);
  lines.push('```' + lang + '\n');
  try {
    const content = fs.readFileSync(file, 'utf8');
    lines.push(content);
  } catch (err) {
    lines.push(`(read error: ${err.message})\n`);
  }
  if (!lines[lines.length - 1].endsWith('\n')) lines.push('\n');
  lines.push('```\n');
}

fs.writeFileSync(outPath, lines.join(''), 'utf8');
console.log(`Wrote ${outPath}`);
console.log(`  src:  ${srcFiles.length} files`);
console.log(`  docs: ${docsFiles.length} files`);
