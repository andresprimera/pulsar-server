import * as fs from 'fs';
import * as path from 'path';

describe('FlowIntegrity', () => {
  const workspaceRoot = path.resolve(__dirname, '../../..');

  const read = (relativePath: string) =>
    fs.readFileSync(path.resolve(workspaceRoot, relativePath), 'utf8');

  it('channels never depend on MessageRepository directly', () => {
    const channelSources = [
      read('src/core/channels/whatsapp/whatsapp-channel.service.ts'),
      read('src/core/channels/whatsapp/providers/meta.adapter.ts'),
      read('src/core/channels/whatsapp/providers/dialog360.adapter.ts'),
      read('src/core/channels/whatsapp/providers/twilio.adapter.ts'),
      read('src/core/channels/instagram/instagram.service.ts'),
      read('src/core/channels/tiktok/tiktok.service.ts'),
      read('src/core/channels/gateway/messaging-gateway.service.ts'),
      read('src/core/channels/channel-router.ts'),
    ];

    for (const source of channelSources) {
      expect(source).not.toContain('MessageRepository');
      expect(source).not.toContain('messageRepository.');
    }
  });

  it('gateway and router do not import persistence', () => {
    const gatewaySources = [
      read('src/core/channels/gateway/messaging-gateway.service.ts'),
      read('src/core/channels/channel-router.ts'),
      read('src/core/channels/channel-adapter.interface.ts'),
    ];

    for (const source of gatewaySources) {
      expect(source).not.toContain('@persistence');
      expect(source).not.toContain('Repository');
    }
  });

  it('gateway does not contain business logic', () => {
    const gatewaySource = read(
      'src/core/channels/gateway/messaging-gateway.service.ts',
    );

    expect(gatewaySource).not.toContain('AgentService');
    expect(gatewaySource).not.toContain('@agent/');
    expect(gatewaySource).not.toContain('@domain/');
    expect(gatewaySource).not.toContain('@persistence/');
  });

  it('agent message writes route through MessagePersistenceService', () => {
    const agentServiceSource = read('src/core/agent/agent.service.ts');

    expect(agentServiceSource).toContain('MessagePersistenceService');
    expect(agentServiceSource).toContain(
      'messagePersistenceService.createUserMessage',
    );
    expect(agentServiceSource).toContain(
      'messagePersistenceService.handleOutgoingMessage',
    );
    expect(agentServiceSource).not.toContain('MessageRepository');
    expect(agentServiceSource).not.toContain('messageRepository.');
  });
});
