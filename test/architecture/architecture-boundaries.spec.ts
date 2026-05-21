import * as fs from 'fs';
import * as path from 'path';
import madge = require('madge');

const SRC_ROOT = path.resolve(__dirname, '../../src');
const TS_CONFIG_PATH = path.resolve(__dirname, '../../tsconfig.json');

jest.setTimeout(30000);

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function getAllFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      return getAllFiles(fullPath);
    }
    if (fullPath.endsWith('.ts') && !fullPath.endsWith('.spec.ts')) {
      return [fullPath];
    }
    return [];
  });
}

function getFilesInLayer(files: string[], layer: string): string[] {
  return files.filter((file) => toPosixPath(file).includes(`/${layer}/`));
}

describe('Architecture Boundaries', () => {
  const files = getAllFiles(SRC_ROOT);

  // Transport layer only: src/core/channels/ (excludes src/features/channels/ API)
  it('Channel layer must not import persistence layer', () => {
    const channelFiles = getFilesInLayer(files, 'core/channels');

    for (const file of channelFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@persistence\//);
      expect(content).not.toMatch(/@database\//);
    }
  });

  it('Channel layer must not import agent layer directly', () => {
    const channelFiles = getFilesInLayer(files, 'core/channels');

    for (const file of channelFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@agent\//);
    }
  });

  it('Orchestrator must not import channels', () => {
    const orchestratorFiles = getFilesInLayer(files, 'orchestrator');

    for (const file of orchestratorFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@channels\//);
    }
  });

  it('Domain must not import channels or orchestrator', () => {
    const domainFiles = getFilesInLayer(files, 'domain');

    for (const file of domainFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@channels\//);
      expect(content).not.toMatch(/@orchestrator\//);
    }
  });

  it('Persistence must not import orchestrator or channels', () => {
    const persistenceFiles = getFilesInLayer(files, 'persistence');

    for (const file of persistenceFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@orchestrator\//);
      expect(content).not.toMatch(/@channels\//);
    }
  });

  it('Persistence must not import agent or channels', () => {
    const persistenceFiles = getFilesInLayer(files, 'persistence');

    for (const file of persistenceFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@agent\//);
      expect(content).not.toMatch(/@channels\//);
    }
  });

  it('Agent layer must not import channels', () => {
    const agentFiles = getFilesInLayer(files, 'agent');

    for (const file of agentFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@channels\//);
    }
  });

  it('Agent layer must not import orchestrator', () => {
    const agentFiles = getFilesInLayer(files, 'agent');

    for (const file of agentFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@orchestrator\//);
    }
  });

  it('Domain must not import agent', () => {
    const domainFiles = getFilesInLayer(files, 'domain');

    for (const file of domainFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@agent\//);
    }
  });

  // TODO: Known violations in conversation.service.ts and agent-routing.service.ts
  //       Remove skip when domain is refactored to not depend on persistence
  it.skip('Domain must not import persistence', () => {
    const domainFiles = getFilesInLayer(files, 'domain');

    for (const file of domainFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@persistence\//);
    }
  });

  it('Telegram webhook registrar must not import persistence', () => {
    const registrarPath = path.resolve(
      SRC_ROOT,
      'core/channels/telegram/webhook/telegram-webhook.registrar.ts',
    );
    expect(fs.existsSync(registrarPath)).toBe(true);
    const content = fs.readFileSync(registrarPath, 'utf8');
    expect(content).not.toMatch(/@persistence\//);
    expect(content).not.toMatch(/from\s+['"][^'"]*core\/persistence\//);
  });

  it('Orchestrator lifecycle services must not import persistence repositories', () => {
    // Per .cursorrules §3 (lifecycle write-back exception): orchestrator may
    // write to webhookRegistration sub-documents only through
    // HIRE_CHANNEL_LIFECYCLE_PORT. Direct persistence repository imports are
    // forbidden in the lifecycle subdirectory.
    const lifecycleDir = path.resolve(SRC_ROOT, 'core/orchestrator/lifecycle');
    expect(fs.existsSync(lifecycleDir)).toBe(true);
    const lifecycleFiles = getAllFiles(lifecycleDir);
    expect(lifecycleFiles.length).toBeGreaterThan(0);
    for (const file of lifecycleFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/@persistence\/repositories\//);
      expect(content).not.toMatch(
        /from\s+['"][^'"]*core\/persistence\/repositories\//,
      );
    }
  });

  describe('features/inbox import policy (Phase 2)', () => {
    // The inbox feature is a thin composition layer over persistence,
    // domain, and the outbound gateway. It MUST NOT reach across into
    // orchestrator (which owns inbound lifecycle), agent (LLM execution),
    // or into any provider-specific channel service. Conversation writes
    // flow through the shared `INBOX_CONVERSATION_WRITE_PORT` via
    // `ConversationService.touch`.
    const INBOX_DIR = path.resolve(SRC_ROOT, 'features/inbox');
    const inboxFiles = fs.existsSync(INBOX_DIR) ? getAllFiles(INBOX_DIR) : [];

    it('discovers the inbox feature folder', () => {
      expect(inboxFiles.length).toBeGreaterThan(0);
    });

    it('does not import @orchestrator/* or @agent/*', () => {
      for (const file of inboxFiles) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toMatch(/from\s+['"]@orchestrator\//);
        expect(content).not.toMatch(/from\s+['"]@agent\//);
      }
    });

    it('does not import provider-specific channel services directly', () => {
      const FORBIDDEN_CHANNEL_PATHS = [
        '@channels/whatsapp/',
        '@channels/telegram/',
        '@channels/instagram/',
        '@channels/tiktok/',
      ];
      for (const file of inboxFiles) {
        const content = fs.readFileSync(file, 'utf8');
        for (const forbidden of FORBIDDEN_CHANNEL_PATHS) {
          expect(content).not.toContain(`from '${forbidden}`);
          expect(content).not.toContain(`from "${forbidden}`);
        }
      }
    });

    it('only imports channels via the gateway or the adapter interface', () => {
      // Positive allow-list for @channels/* imports inside the inbox
      // feature. Anything else is a layering violation.
      const ALLOWED_CHANNEL_IMPORTS = new Set<string>([
        '@channels/gateway/messaging-gateway.service',
        '@channels/gateway/messaging-gateway.module',
        '@channels/channel-adapter.interface',
      ]);
      const offenders: string[] = [];
      for (const file of inboxFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const regex = /from\s+['"](@channels\/[^'"]+)['"]/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
          if (!ALLOWED_CHANNEL_IMPORTS.has(match[1])) {
            offenders.push(`${toPosixPath(file)} → ${match[1]}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it('only allowed first-party alias roots are imported', () => {
      // Positive allow-list of internal alias roots the inbox feature
      // MAY import from. Third-party packages (e.g. `@nestjs/*`,
      // `@types/*`) and unprefixed imports (e.g. `mongoose`, relative
      // siblings) are out of scope.
      const FIRST_PARTY_PREFIXES = [
        '@agent/',
        '@orchestrator/',
        '@channels/',
        '@domain/',
        '@persistence/',
        '@shared/',
      ];
      const ALLOWED_FIRST_PARTY = new Set<string>([
        '@persistence',
        '@domain',
        '@channels',
        '@shared',
      ]);
      const offenders: string[] = [];
      for (const file of inboxFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const regex = /from\s+['"]([^'"]+)['"]/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
          const source = match[1];
          for (const prefix of FIRST_PARTY_PREFIXES) {
            if (source.startsWith(prefix)) {
              const root = prefix.replace(/\/$/, '');
              if (!ALLOWED_FIRST_PARTY.has(root)) {
                offenders.push(`${toPosixPath(file)} → ${source}`);
              }
              break;
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it('writes to conversation list columns go through ConversationService.touch', () => {
      // The feature folder MAY import `ConversationRepository` for
      // tenant-scoped reads (`findByIdForClient`) and the
      // `updateControlMode` write (a discrete column, not list
      // enrichment). It MUST NOT call the list-column writers
      // `updateLastMessageAt` or `setEnrichmentFields` directly — those
      // flow through `ConversationService.touch` /
      // `INBOX_CONVERSATION_WRITE_PORT`.
      const FORBIDDEN_REPO_METHODS = [
        '.updateLastMessageAt(',
        '.setEnrichmentFields(',
      ];
      const offenders: string[] = [];
      for (const file of inboxFiles) {
        const content = fs.readFileSync(file, 'utf8');
        for (const sym of FORBIDDEN_REPO_METHODS) {
          if (content.includes(sym)) {
            offenders.push(`${toPosixPath(file)} uses ${sym}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  it('No relative parent imports across layers', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/from\s+['"]\.\.\//);
    }
  });

  it('No circular dependencies', async () => {
    const result = await madge(SRC_ROOT, {
      fileExtensions: ['ts'],
      tsConfig: TS_CONFIG_PATH,
      excludeRegExp: ['\\.spec\\.ts$'],
    });

    expect(result.circular()).toEqual([]);
  });
});
