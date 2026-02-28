import * as fs from 'fs';
import * as path from 'path';

describe('FlowIntegrity', () => {
  const workspaceRoot = path.resolve(__dirname, '../../..');

  const read = (relativePath: string) =>
    fs.readFileSync(path.resolve(workspaceRoot, relativePath), 'utf8');

  it('channels never depend on MessageRepository directly', () => {
    const channelSources = [
      read('src/channels/whatsapp/whatsapp.service.ts'),
      read('src/channels/instagram/instagram.service.ts'),
      read('src/channels/tiktok/tiktok.service.ts'),
    ];

    for (const source of channelSources) {
      expect(source).not.toContain('MessageRepository');
      expect(source).not.toContain('messageRepository.');
    }
  });

  it('agent message writes route through MessagePersistenceService', () => {
    const agentServiceSource = read('src/agent/agent.service.ts');

    expect(agentServiceSource).toContain('MessagePersistenceService');
    expect(agentServiceSource).toContain('messagePersistenceService.createUserMessage');
    expect(agentServiceSource).toContain('messagePersistenceService.handleOutgoingMessage');
    expect(agentServiceSource).not.toContain('MessageRepository');
    expect(agentServiceSource).not.toContain('messageRepository.');
  });
});
