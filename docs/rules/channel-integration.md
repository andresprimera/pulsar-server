# Channel Integration Pattern

## Adding a New Channel

New channels follow the pattern established in `src/channels/whatsapp/`. Each channel has four files:

```
src/channels/<channel-name>/
  ├── <channel>.config.ts     — interface + load*Config() + URL helpers
  ├── <channel>.service.ts    — handleIncoming() + sendMessage()
  ├── <channel>.controller.ts — GET webhook (verify) + POST webhook (incoming)
  └── <channel>.module.ts     — declares controller + service
```

### Config file (`*.config.ts`)

Defines a typed interface for server-level config (not per-client), loads from env with defaults, and provides URL builder helpers.

```typescript
export interface WhatsAppServerConfig {
  apiHost: string;
  apiVersion: string;
  webhookVerifyToken: string;
}

export function loadWhatsAppConfig(): WhatsAppServerConfig {
  return {
    apiHost: process.env.WHATSAPP_API_HOST || 'https://graph.facebook.com',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'dev',
  };
}

export function buildMessagesUrl(config: WhatsAppServerConfig, phoneNumberId: string): string {
  return `${config.apiHost}/${config.apiVersion}/${phoneNumberId}/messages`;
}
```

### Controller (`*.controller.ts`)

Thin — only handles HTTP. Two endpoints:

```typescript
@Controller('<channel>')
export class ChannelController {
  @Get('webhook')   // Webhook verification (Meta/TikTok challenge-response)
  verify(...) { ... }

  @Post('webhook')  // Incoming messages
  @HttpCode(200)
  async handleWebhook(@Body() payload: unknown): Promise<string> {
    await this.channelService.handleIncoming(payload);
    return 'ok';
  }
}
```

### Service (`*.service.ts`)

Contains the core logic:

1. **`handleIncoming(payload)`** — Parses webhook payload, routes to agent, sends reply
2. **`sendMessage()` (private)** — Calls the channel's API to send a message

### Module (`*.module.ts`)

Standard NestJS module:

```typescript
@Module({
  controllers: [ChannelController],
  providers: [ChannelService],
})
export class ChannelModule {}
```

Register the module in `AppModule.imports`.

---

## Agent Routing (REQUIRED)

All incoming channel messages MUST use `AgentRoutingService.resolveRoute()` for agent selection. Do NOT hardcode agent selection.

```typescript
const routeDecision = await this.agentRoutingService.resolveRoute({
  channelIdentifier: phoneNumberId,  // or tiktokUserId, instagramAccountId
  externalUserId: message.from,
  incomingText: message.text.body,
  channelType: 'whatsapp',           // or 'tiktok', 'instagram'
});
```

Handle all three outcomes:

| `routeDecision.kind` | Action |
|----------------------|--------|
| `resolved` | Build `AgentContext` + `AgentInput`, call `AgentService.run()` |
| `ambiguous` | Send disambiguation prompt to user via `sendMessage()` |
| `unroutable` | Log warning, return silently |

---

## Message Flow (REQUIRED)

Channel services build `AgentContext` + `AgentInput`, enrich the context, and call `AgentService.run()`:

```typescript
const rawContext: AgentContext = {
  agentId: clientAgent.agentId,
  agentName: agent.name,
  clientId: clientAgent.clientId,
  channelId: channelConfig.channelId.toString(),
  systemPrompt: agent.systemPrompt,
  llmConfig: { provider, apiKey: decrypt(apiKey), model },
  channelConfig: decryptRecord(channelConfig.credentials),
};

const context = await this.agentContextService.enrichContext(rawContext);

const input: AgentInput = {
  channel: 'whatsapp',
  externalUserId: message.from,
  conversationId: `${phoneNumberId}:${message.from}`,
  message: { type: 'text', text: message.text.body },
  metadata: { messageId: message.id, phoneNumberId },
};

const output = await this.agentService.run(input, context);
```

> **REQUIRED**: Always call `agentContextService.enrichContext()` before `agentService.run()`. See `docs/rules/context-enrichment.md` for details.

Do NOT persist messages manually — `AgentService.run()` handles incoming + outgoing persistence automatically via `MessagePersistenceService`. Conversation history is automatically loaded and passed to the LLM.

---

## Channel Provider Enum

When adding a new channel, add its provider to `src/channels/channel-provider.enum.ts`:

```typescript
export enum ChannelProvider {
  Meta = 'meta',
  Twilio = 'twilio',
  Tiktok = 'tiktok',
  Instagram = 'instagram',
  // NewProvider = 'newprovider',
}
```

Also add a routing key field to `HireChannelConfig` in `src/database/schemas/client-agent.schema.ts` and a corresponding `findActiveBy*()` method in `ClientAgentRepository`.
