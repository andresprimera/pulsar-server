import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { WhatsAppChannelService } from '../src/core/channels/whatsapp/whatsapp-channel.service';

// Prevent real outbound HTTP traffic from the channel send path.
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  text: jest.fn().mockResolvedValue(''),
} as any);

/**
 * Programmable AI SDK mock. Each test arranges `mockGenerateText` to
 * either return plain text OR to invoke the registered tool by name with
 * a payload — emulating the Vercel AI SDK auto-execute behavior. The
 * mock returns `{ text, toolCalls }` shape so we exercise the same code
 * path the production SDK would.
 */
const mockGenerateText = jest.fn();
jest.mock('ai', () => {
  const actual = jest.requireActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: (...args: unknown[]) => (mockGenerateText as any)(...args),
  };
});

/**
 * Helper: invokes the tool's `execute` for the named tool with the given
 * input, mimicking the AI SDK auto-execution. Returns the resolved tool
 * output plus a synthetic `{ text, toolCalls, steps, usage }` object so
 * the call site in `AgentService.run` can extract usage normally.
 */
async function fakeGenerateWithToolCall(
  args: any,
  toolName: string,
  input: unknown,
): Promise<any> {
  const toolEntry = (args.tools ?? {})[toolName];
  if (!toolEntry || typeof toolEntry.execute !== 'function') {
    throw new Error(`tool ${toolName} not present in tool set`);
  }
  const toolResult = await toolEntry.execute(input);
  return {
    text: 'Got it — recorded.',
    toolCalls: [{ toolName, args: input }],
    toolResults: [{ toolName, result: toolResult }],
    steps: [],
  };
}

describe('Lead Qualifier (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let whatsappService: WhatsAppChannelService;

  const clientIdObj = new Types.ObjectId();
  const clientId = clientIdObj.toString();
  const agentIdObj = new Types.ObjectId();
  const agentId = agentIdObj.toString();
  const clientAgentIdObj = new Types.ObjectId();
  const channelIdObj = new Types.ObjectId();
  const phoneNumberId = 'lead-qualifier-e2e-phone';
  const userPhone = '+19998887777';
  const normalizedExternalId = userPhone.replace(/[^\d]/g, '');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());
    whatsappService = moduleFixture.get<WhatsAppChannelService>(
      WhatsAppChannelService,
    );

    // Clean any pre-existing fixture state.
    await cleanup();

    await connection.collection('clients').insertOne({
      _id: clientIdObj,
      name: 'Lead Qualifier E2E Client',
      type: 'individual',
      status: 'active',
      billingCurrency: 'USD',
      billingAnchor: new Date(),
    });

    await connection.collection('agents').insertOne({
      _id: agentIdObj,
      name: 'E2E Lead Qualifier',
      systemPrompt: 'You are a friendly lead qualifier.',
      status: 'active',
      kind: 'lead_qualifier',
      toolingProfileId: 'lead-qualifier',
    });

    await connection.collection('channels').insertOne({
      _id: channelIdObj,
      name: 'WhatsApp',
      type: 'whatsapp',
      supportedProviders: ['meta'],
    });

    await connection.collection('client_agents').insertOne({
      _id: clientAgentIdObj,
      clientId,
      agentId,
      status: 'active',
      channels: [
        {
          channelId: channelIdObj,
          provider: 'meta',
          status: 'active',
          phoneNumberId,
          credentials: { phoneNumberId },
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  async function cleanup() {
    if (!connection) return;
    await connection.collection('clients').deleteOne({ _id: clientIdObj });
    await connection.collection('agents').deleteOne({ _id: agentIdObj });
    await connection
      .collection('client_agents')
      .deleteOne({ _id: clientAgentIdObj });
    await connection.collection('channels').deleteOne({ _id: channelIdObj });
    await connection
      .collection('messages')
      .deleteMany({ channelId: channelIdObj });
    await connection
      .collection('contacts')
      .deleteMany({ externalId: normalizedExternalId });
    await connection
      .collection('conversations')
      .deleteMany({ clientId: clientIdObj });
    await connection.collection('leads').deleteMany({ clientId: clientIdObj });
    await connection
      .collection('processed_events')
      .deleteMany({ channel: 'whatsapp' });
  }

  function buildInboundPayload(messageId: string, text: string) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: userPhone,
                    id: messageId,
                    type: 'text',
                    text: { body: text },
                  },
                ],
                metadata: { phone_number_id: phoneNumberId },
              },
            },
          ],
        },
      ],
    };
  }

  it('creates a Lead stub with state="new" on the first inbound message for a lead_qualifier agent', async () => {
    mockGenerateText.mockResolvedValue({ text: 'Hello!' });

    await whatsappService.handleIncoming(
      buildInboundPayload('lq-msg-1', 'hi there'),
      'meta',
    );
    await new Promise((r) => setTimeout(r, 200));

    const lead = await connection
      .collection('leads')
      .findOne({ clientId: clientIdObj });

    expect(lead).toBeTruthy();
    expect(lead.state).toBe('new');
    expect(lead.agentId.toString()).toBe(agentId);
    expect(lead.fields).toEqual({});
  });

  it('transitions Lead to "qualified" when the LLM emits record_lead_qualification with all three fields', async () => {
    mockGenerateText.mockImplementation((args: any) =>
      fakeGenerateWithToolCall(args, 'record_lead_qualification', {
        intent: 'demo',
        budget: { amount: 50000, currency: 'USD' },
        timeline: { horizon: 'Q3 2026' },
      }),
    );

    await whatsappService.handleIncoming(
      buildInboundPayload('lq-msg-2', 'I want a demo. budget 50k Q3 2026'),
      'meta',
    );
    await new Promise((r) => setTimeout(r, 200));

    const lead = await connection
      .collection('leads')
      .findOne({ clientId: clientIdObj });

    expect(lead).toBeTruthy();
    expect(lead.state).toBe('qualified');
    expect(lead.fields.intent).toBe('demo');
    expect(lead.fields.budget).toEqual({ amount: 50000, currency: 'USD' });
    expect(lead.fields.timeline).toEqual({ horizon: 'Q3 2026' });
    expect(lead.lastQualificationAt).toBeInstanceOf(Date);
  });

  it('transitions Lead to "disqualified" when LLM emits disqualify=true', async () => {
    mockGenerateText.mockImplementation((args: any) =>
      fakeGenerateWithToolCall(args, 'record_lead_qualification', {
        disqualify: true,
      }),
    );

    await whatsappService.handleIncoming(
      buildInboundPayload('lq-msg-3', 'not interested, please stop'),
      'meta',
    );
    await new Promise((r) => setTimeout(r, 200));

    const lead = await connection
      .collection('leads')
      .findOne({ clientId: clientIdObj });

    expect(lead).toBeTruthy();
    expect(lead.state).toBe('disqualified');
  });

  it('upsertStub is idempotent — second inbound message does not create a duplicate Lead', async () => {
    mockGenerateText.mockResolvedValue({ text: 'okay' });

    const before = await connection
      .collection('leads')
      .find({ clientId: clientIdObj })
      .toArray();

    await whatsappService.handleIncoming(
      buildInboundPayload('lq-msg-4', 'follow-up message'),
      'meta',
    );
    await new Promise((r) => setTimeout(r, 200));

    const after = await connection
      .collection('leads')
      .find({ clientId: clientIdObj })
      .toArray();

    expect(after).toHaveLength(before.length);
  });
});
