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

  it('Channel layer must not import persistence layer', () => {
    const channelFiles = getFilesInLayer(files, 'channels');

    for (const file of channelFiles) {
      const content = fs.readFileSync(file, 'utf8');

      expect(content).not.toMatch(/@persistence\//);
      expect(content).not.toMatch(/@database\//);
    }
  });

  it('Channel layer must not import agent layer directly', () => {
    const channelFiles = getFilesInLayer(files, 'channels');

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
