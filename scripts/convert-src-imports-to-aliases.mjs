#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');

const aliasRoots = [
  ['@channels', path.join(srcRoot, 'channels')],
  ['@agent', path.join(srcRoot, 'agent')],
  ['@database', path.join(srcRoot, 'database')],
  ['@domain', path.join(srcRoot, 'domain')],
  ['@shared', path.join(srcRoot, 'shared')],
  ['@agents', path.join(srcRoot, 'agents')],
  ['@clients', path.join(srcRoot, 'clients')],
  ['@client-agents', path.join(srcRoot, 'client-agents')],
  ['@users', path.join(srcRoot, 'users')],
  ['@onboarding', path.join(srcRoot, 'onboarding')],
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function toAlias(fromFile, spec) {
  if (!spec.startsWith('../')) return null;

  const abs = path.normalize(path.resolve(path.dirname(fromFile), spec));

  for (const [alias, root] of aliasRoots) {
    const rel = path.relative(root, abs);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      const normalized = rel.split(path.sep).join('/');
      return normalized.length ? `${alias}/${normalized}` : alias;
    }
  }

  return null;
}

function transform(content, filePath) {
  let changed = false;

  const replaceInSpecifier = (match, quote, spec) => {
    const alias = toAlias(filePath, spec);
    if (!alias) return match;
    changed = true;
    return match.replace(`${quote}${spec}${quote}`, `${quote}${alias}${quote}`);
  };

  let out = content;

  out = out.replace(/(from\s+)(['"])([^'"]+)\2/g, (m, _from, quote, spec) =>
    replaceInSpecifier(m, quote, spec),
  );

  out = out.replace(/(import\s*\(\s*)(['"])([^'"]+)\2(\s*\))/g, (m, _a, quote, spec) =>
    replaceInSpecifier(m, quote, spec),
  );

  return { out, changed };
}

const files = walk(srcRoot);
let changedCount = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const { out, changed } = transform(original, file);
  if (changed) {
    fs.writeFileSync(file, out, 'utf8');
    changedCount += 1;
  }
}

console.log(`Updated ${changedCount} files.`);
