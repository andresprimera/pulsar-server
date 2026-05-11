import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');
const ALLOWED_MODULE_REL =
  'features/authorization/authorization.module.ts'.replace(/\//g, path.sep);

function getModuleFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      return getModuleFiles(fullPath);
    }
    if (fullPath.endsWith('.module.ts') && !fullPath.endsWith('.spec.ts')) {
      return [fullPath];
    }
    return [];
  });
}

/**
 * Strip block comments and line comments. Crude but sufficient for this
 * check — we only need to ignore mentions of the symbol inside JSDoc.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Architecture invariant: `APP_GUARD` is registered in EXACTLY ONE module —
 * `src/features/authorization/authorization.module.ts`. Within-module
 * `providers` ordering is the only NestJS-guaranteed `APP_GUARD` ordering
 * surface; consolidating registration keeps the guard chain order
 * deterministic.
 */
describe('Architecture: APP_GUARD is registered in a single module', () => {
  it('only authorization.module.ts references APP_GUARD', () => {
    const files = getModuleFiles(SRC_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (!/\bAPP_GUARD\b/.test(code)) continue;

      const rel = path.relative(SRC_ROOT, file);
      if (rel !== ALLOWED_MODULE_REL) {
        offenders.push(rel);
      }
    }

    if (offenders.length > 0) {
      const offenderList = offenders.join('\n  ');
      const allowed = ALLOWED_MODULE_REL.replace(/\\/g, '/');
      throw new Error(
        `Architecture violation: APP_GUARD must only be registered in src/${allowed} but was found in:\n  ${offenderList}`,
      );
    }
  });
});
