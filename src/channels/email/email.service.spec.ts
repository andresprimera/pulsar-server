import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { EmailService, EmailCredentials } from './email.service';
import { AgentService } from '../../agent/agent.service';
import { ClientAgentRepository } from '../../database/repositories/client-agent.repository';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { ClientAgent } from '../../database/schemas/client-agent.schema';
import { LlmProvider } from '../../agent/llm/provider.enum';
import { IncomingEmailDto } from './dto/incoming-email.dto';
import * as nodemailer from 'nodemailer';
import { ChannelProvider } from '../../channels/channel-provider.enum';

jest.mock('nodemailer');

jest.mock('imapflow', () => {
  return {
    ImapFlow: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ImapFlow } = require('imapflow');

describe('EmailService', () => {
  let service: EmailService;
  let agentService: jest.Mocked<AgentService>;
  let clientAgentRepository: jest.Mocked<ClientAgentRepository>;
  let agentRepository: jest.Mocked<AgentRepository>;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let mockSendMail: jest.Mock;

  const createDto = (
    overrides: Partial<IncomingEmailDto> = {},
  ): IncomingEmailDto => ({
    from: 'user@example.com',
    to: 'support@example.com',
    subject: 'Help',
    text: 'I need help',
    ...overrides,
  });

  const mockChannelConfig = {
    provider: ChannelProvider.Smtp,
    status: 'active',
    credentials: {
      email: 'support@example.com',
      password: 'secret',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      imapHost: 'imap.example.com',
      imapPort: 993,
    },
    llmConfig: {
      provider: LlmProvider.OpenAI,
      apiKey: 'sk-mock-key',
      model: 'gpt-4',
    },
  };

  const mockClientAgent = {
    _id: 'ca-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    status: 'active',
    price: 10,
    channels: [mockChannelConfig],
  };

  const mockAgent = {
    id: 'agent-1',
    name: 'Support Bot',
    systemPrompt: 'You are a helpful assistant.',
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    mockSendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: AgentService,
          useValue: { run: jest.fn() },
        },
        {
          provide: ClientAgentRepository,
          useValue: {
            findOneByEmail: jest.fn(),
            findAllWithActiveEmailChannels: jest.fn(),
          },
        },
        {
          provide: AgentRepository,
          useValue: { findActiveById: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    agentService = module.get(AgentService);
    clientAgentRepository = module.get(ClientAgentRepository);
    agentRepository = module.get(AgentRepository);

    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  describe('onModuleInit / onModuleDestroy', () => {
    it('should start polling on init and stop on destroy', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.onModuleInit();
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);

      service.onModuleDestroy();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should log startup message on init', () => {
      service.onModuleInit();
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting IMAP polling'),
      );
    });

    it('should be safe to call onModuleDestroy multiple times', () => {
      service.onModuleInit();
      service.onModuleDestroy();
      // Second call should not throw
      expect(() => service.onModuleDestroy()).not.toThrow();
    });

    it('should be safe to call onModuleDestroy without init', () => {
      // pollTimer is null by default
      expect(() => service.onModuleDestroy()).not.toThrow();
    });

    it('should set pollTimer to null after destroy', () => {
      service.onModuleInit();
      expect((service as any).pollTimer).not.toBeNull();

      service.onModuleDestroy();
      expect((service as any).pollTimer).toBeNull();
    });

    it('should invoke pollAllMailboxes on each interval tick', () => {
      const pollSpy = jest
        .spyOn(service, 'pollAllMailboxes')
        .mockResolvedValue();
      clientAgentRepository.findAllWithActiveEmailChannels.mockResolvedValue(
        [],
      );

      service.onModuleInit();

      jest.advanceTimersByTime(30_000);
      expect(pollSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30_000);
      expect(pollSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ─── pollAllMailboxes ───────────────────────────────────────────────────

  // ─── pollAllMailboxes ───────────────────────────────────────────────────

  describe('pollAllMailboxes', () => {
    it('should skip when already polling', async () => {
      (service as any).isPolling = true;

      await service.pollAllMailboxes();

      expect(
        clientAgentRepository.findAllWithActiveEmailChannels,
      ).not.toHaveBeenCalled();
    });

    it('should set isPolling to true during execution', async () => {
      let capturedFlag: boolean | undefined;
      clientAgentRepository.findAllWithActiveEmailChannels.mockImplementation(
        async () => {
          capturedFlag = (service as any).isPolling;
          return [];
        },
      );

      await service.pollAllMailboxes();

      expect(capturedFlag).toBe(true);
    });

    it('should set isPolling back to false after successful run', async () => {
      clientAgentRepository.findAllWithActiveEmailChannels.mockResolvedValue(
        [],
      );

      await service.pollAllMailboxes();

      expect((service as any).isPolling).toBe(false);
    });

    it('should handle empty channel list gracefully', async () => {
      clientAgentRepository.findAllWithActiveEmailChannels.mockResolvedValue(
        [],
      );

      await service.pollAllMailboxes();

      expect(
        clientAgentRepository.findAllWithActiveEmailChannels,
      ).toHaveBeenCalled();
      expect((service as any).isPolling).toBe(false);
    });

    it('should fetch active email channels and poll each', async () => {
      clientAgentRepository.findAllWithActiveEmailChannels.mockResolvedValue([
        mockClientAgent as any,
      ]);

      const pollMailboxSpy = jest
        .spyOn(service, 'pollMailbox')
        .mockResolvedValue();

      await service.pollAllMailboxes();

      expect(
        clientAgentRepository.findAllWithActiveEmailChannels,
      ).toHaveBeenCalled();
      expect(pollMailboxSpy).toHaveBeenCalledWith(
        mockChannelConfig.credentials,
        mockClientAgent,
      );
    });

    it('should poll multiple channels sequentially', async () => {
      const channel2Config = {
        ...mockChannelConfig,
        credentials: {
          ...mockChannelConfig.credentials,
          email: 'sales@example.com',
        },
      };

      const clientAgentWithMultiChannels = {
        ...mockClientAgent,
        channels: [mockChannelConfig, channel2Config],
      };

      clientAgentRepository.findAllWithActiveEmailChannels.mockResolvedValue([
        clientAgentWithMultiChannels as any,
      ]);

      const callOrder: string[] = [];
      jest
        .spyOn(service, 'pollMailbox')
        .mockImplementation(async (config: any) => {
          callOrder.push(config.email);
        });

      await service.pollAllMailboxes();

      expect(callOrder).toEqual(['support@example.com', 'sales@example.com']);
    });

    it('should continue polling other channels when one fails', async () => {
      const channel2Config = {
        ...mockChannelConfig,
        credentials: {
          ...mockChannelConfig.credentials,
          email: 'other@example.com',
        },
      };
      const clientAgentWithMultiChannels = {
        ...mockClientAgent,
        channels: [mockChannelConfig, channel2Config],
      };

      clientAgentRepository.findAllWithActiveEmailChannels.mockResolvedValue([
        clientAgentWithMultiChannels as any,
      ]);

      const pollMailboxSpy = jest
        .spyOn(service, 'pollMailbox')
        .mockRejectedValueOnce(new Error('IMAP connection failed'))
        .mockResolvedValueOnce();

      await service.pollAllMailboxes();

      expect(pollMailboxSpy).toHaveBeenCalledTimes(2);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to poll mailbox for clientAgent=ca-1'),
      );
    });

    it('should log error with channel email when polling fails', async () => {
      const failingChannelConfig = {
        ...mockChannelConfig,
        credentials: {
          ...mockChannelConfig.credentials,
          email: 'failing@example.com',
        },
      };
      const clientAgent = {
        ...mockClientAgent,
        channels: [failingChannelConfig],
      };

      clientAgentRepository.findAllWithActiveEmailChannels.mockResolvedValue([
        clientAgent as any,
      ]);

      jest
        .spyOn(service, 'pollMailbox')
        .mockRejectedValue(new Error('timeout'));

      await service.pollAllMailboxes();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to poll mailbox for clientAgent=ca-1: timeout',
        ),
      );
    });

    it('should handle non-Error objects in catch block', async () => {
      clientAgentRepository.findAllWithActiveEmailChannels.mockResolvedValue([
        mockClientAgent as any,
      ]);

      jest.spyOn(service, 'pollMailbox').mockRejectedValue('string error');

      await service.pollAllMailboxes();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('string error'),
      );
    });

    it('should reset isPolling flag even on error', async () => {
      clientAgentRepository.findAllWithActiveEmailChannels.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(service.pollAllMailboxes()).rejects.toThrow('DB error');

      expect((service as any).isPolling).toBe(false);
    });
  });

  // ─── pollMailbox ────────────────────────────────────────────────────────

  // ─── pollMailbox ────────────────────────────────────────────────────────

  describe('pollMailbox', () => {
    let mockConnect: jest.Mock;
    let mockGetMailboxLock: jest.Mock;
    let mockFetch: jest.Mock;
    let mockMessageFlagsAdd: jest.Mock;
    let mockLogout: jest.Mock;
    let mockRelease: jest.Mock;

    beforeEach(() => {
      mockConnect = jest.fn().mockResolvedValue(undefined);
      mockRelease = jest.fn();
      mockGetMailboxLock = jest
        .fn()
        .mockResolvedValue({ release: mockRelease });
      mockMessageFlagsAdd = jest.fn().mockResolvedValue(true);
      mockLogout = jest.fn().mockResolvedValue(undefined);
      mockFetch = jest.fn();

      ImapFlow.mockImplementation(() => ({
        connect: mockConnect,
        getMailboxLock: mockGetMailboxLock,
        fetch: mockFetch,
        messageFlagsAdd: mockMessageFlagsAdd,
        logout: mockLogout,
      }));
    });

    it('should connect to IMAP with correct config', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      mockFetch.mockReturnValue((async function* () {})());

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(ImapFlow).toHaveBeenCalledWith({
        host: 'imap.example.com',
        port: 993,
        secure: true,
        auth: { user: 'support@example.com', pass: 'secret' },
        logger: false,
      });
      expect(mockConnect).toHaveBeenCalled();
      expect(mockGetMailboxLock).toHaveBeenCalledWith('INBOX');
    });

    it('should fetch unseen messages with correct query', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      mockFetch.mockReturnValue((async function* () {})());

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        { seen: false },
        { envelope: true, bodyParts: ['1'], uid: true },
      );
    });

    it('should fetch unseen messages, extract envelope + body, process, and mark as seen', async () => {
      const bodyParts = new Map([['1', Buffer.from('Hello there')]]);
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 42,
            envelope: {
              from: [{ address: 'sender@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'Test Subject',
              messageId: 'msg-123',
            },
            bodyParts,
          };
        })(),
      );

      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(clientAgentRepository.findOneByEmail).toHaveBeenCalledWith(
        'support@example.com',
      );
      expect(agentService.run).toHaveBeenCalled();
      expect(mockMessageFlagsAdd).toHaveBeenCalledWith(42, ['\\Seen'], {
        uid: true,
      });
    });

    it('should ignore inactive channels even if email matches', async () => {
      const inactiveChannel = { ...mockChannelConfig, status: 'inactive' };
      const clientAgentWithInactive = {
        ...mockClientAgent,
        channels: [inactiveChannel],
      };

      clientAgentRepository.findOneByEmail.mockResolvedValue(
        clientAgentWithInactive as any,
      );

      await service.handleIncoming(createDto());

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[Email] Channel config not found in ClientAgent for email=support@example.com (mismatch).',
        ),
      );
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should select active channel when multiple channels present', async () => {
      const inactiveChannel = { ...mockChannelConfig, status: 'inactive' };
      const activeChannel = { ...mockChannelConfig, status: 'active' };
      const clientAgentMixed = {
        ...mockClientAgent,
        channels: [inactiveChannel, activeChannel],
      };

      clientAgentRepository.findOneByEmail.mockResolvedValue(
        clientAgentMixed as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({});

      await service.handleIncoming(createDto());

      expect(agentService.run).toHaveBeenCalled();
    });

    it('should process message normally', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 1,
            envelope: {
              from: [{ address: 'alice@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'First',
              messageId: 'msg-1',
            },
            bodyParts: new Map([['1', Buffer.from('First message')]]),
          };
          yield {
            uid: 2,
            envelope: {
              from: [{ address: 'bob@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'Second',
              messageId: 'msg-2',
            },
            bodyParts: new Map([['1', Buffer.from('Second message')]]),
          };
          yield {
            uid: 3,
            envelope: {
              from: [{ address: 'charlie@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'Third',
              messageId: 'msg-3',
            },
            bodyParts: new Map([['1', Buffer.from('Third message')]]),
          };
        })(),
      );

      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(clientAgentRepository.findOneByEmail).toHaveBeenCalledTimes(3);
      expect(agentService.run).toHaveBeenCalledTimes(3);
      expect(mockMessageFlagsAdd).toHaveBeenCalledTimes(3);
      expect(mockMessageFlagsAdd).toHaveBeenCalledWith(1, ['\\Seen'], {
        uid: true,
      });
      expect(mockMessageFlagsAdd).toHaveBeenCalledWith(2, ['\\Seen'], {
        uid: true,
      });
      expect(mockMessageFlagsAdd).toHaveBeenCalledWith(3, ['\\Seen'], {
        uid: true,
      });
    });

    it('should handle message with missing from address', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 10,
            envelope: {
              from: [],
              to: [{ address: 'support@example.com' }],
              subject: 'No sender',
            },
            bodyParts: new Map([['1', Buffer.from('text')]]),
          };
        })(),
      );

      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({});

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      // from should default to empty string
      expect(clientAgentRepository.findOneByEmail).toHaveBeenCalledWith(
        'support@example.com',
      );
    });

    it('should fallback to channelConfig email when to address is missing', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 11,
            envelope: {
              from: [{ address: 'sender@example.com' }],
              to: [],
              subject: 'No recipient',
            },
            bodyParts: new Map([['1', Buffer.from('text')]]),
          };
        })(),
      );

      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({});

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      // to should fallback to channelConfig.email
      expect(clientAgentRepository.findOneByEmail).toHaveBeenCalledWith(
        'support@example.com',
      );
    });

    it('should use "(no subject)" when subject is missing', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 12,
            envelope: {
              from: [{ address: 'sender@example.com' }],
              to: [{ address: 'support@example.com' }],
              // no subject field
            },
            bodyParts: new Map([['1', Buffer.from('text')]]),
          };
        })(),
      );

      const handleSpy = jest
        .spyOn(service, 'handleIncoming')
        .mockResolvedValue();

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(handleSpy).toHaveBeenCalledWith(
        expect.objectContaining({ subject: '(no subject)' }),
      );
    });

    it('should handle empty body (no bodyParts)', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 13,
            envelope: {
              from: [{ address: 'sender@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'Empty body',
            },
            bodyParts: new Map(),
          };
        })(),
      );

      const handleSpy = jest
        .spyOn(service, 'handleIncoming')
        .mockResolvedValue();

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(handleSpy).toHaveBeenCalledWith(
        expect.objectContaining({ text: '' }),
      );
    });

    it('should pass messageId from envelope to DTO', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 14,
            envelope: {
              from: [{ address: 'sender@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'With ID',
              messageId: '<unique-id-123@example.com>',
            },
            bodyParts: new Map([['1', Buffer.from('text')]]),
          };
        })(),
      );

      const handleSpy = jest
        .spyOn(service, 'handleIncoming')
        .mockResolvedValue();

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(handleSpy).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: '<unique-id-123@example.com>' }),
      );
    });

    it('should set messageId to undefined when not present in envelope', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 15,
            envelope: {
              from: [{ address: 'sender@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'No ID',
            },
            bodyParts: new Map([['1', Buffer.from('text')]]),
          };
        })(),
      );

      const handleSpy = jest
        .spyOn(service, 'handleIncoming')
        .mockResolvedValue();

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(handleSpy).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: undefined }),
      );
    });

    it('should not mark as seen when processing fails', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 42,
            envelope: {
              from: [{ address: 'sender@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'Test',
            },
            bodyParts: new Map([['1', Buffer.from('text')]]),
          };
        })(),
      );

      clientAgentRepository.findOneByEmail.mockRejectedValue(
        new Error('DB error'),
      );

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(mockMessageFlagsAdd).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process message uid=42'),
      );
    });

    it('should continue processing next messages when one message fails', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 100,
            envelope: {
              from: [{ address: 'fail@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'Will fail',
            },
            bodyParts: new Map([['1', Buffer.from('fail')]]),
          };
          yield {
            uid: 101,
            envelope: {
              from: [{ address: 'ok@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'Will succeed',
            },
            bodyParts: new Map([['1', Buffer.from('ok')]]),
          };
        })(),
      );

      clientAgentRepository.findOneByEmail
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(mockClientAgent as any);
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      // First message failed - not marked as seen
      expect(mockMessageFlagsAdd).not.toHaveBeenCalledWith(
        100,
        expect.anything(),
        expect.anything(),
      );
      // Second message succeeded - marked as seen
      expect(mockMessageFlagsAdd).toHaveBeenCalledWith(101, ['\\Seen'], {
        uid: true,
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process message uid=100'),
      );
    });

    it('should log error with non-Error objects during message processing', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          yield {
            uid: 50,
            envelope: {
              from: [{ address: 'sender@example.com' }],
              to: [{ address: 'support@example.com' }],
              subject: 'Test',
            },
            bodyParts: new Map([['1', Buffer.from('text')]]),
          };
        })(),
      );

      jest
        .spyOn(service, 'handleIncoming')
        .mockRejectedValue('unexpected string error');

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('unexpected string error'),
      );
    });

    it('should always release lock and logout', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      mockFetch.mockReturnValue((async function* () {})());

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(mockRelease).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should release lock and logout even when fetch throws', async () => {
      mockFetch.mockReturnValue(
        (async function* () {
          throw new Error('IMAP fetch error');
        })(),
      );

      await expect(
        service.pollMailbox(
          mockChannelConfig.credentials as EmailCredentials,
          mockClientAgent as unknown as ClientAgent,
        ),
      ).rejects.toThrow('IMAP fetch error');

      expect(mockRelease).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should use default IMAP config when not provided', async () => {
      const minimalChannelConfig = {
        email: 'support@example.com',
        password: 'secret',
      };

      // eslint-disable-next-line @typescript-eslint/no-empty-function
      mockFetch.mockReturnValue((async function* () {})());

      await service.pollMailbox(
        minimalChannelConfig as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(ImapFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'imap.gmail.com',
          port: 993,
        }),
      );
    });

    it('should always use secure: true for IMAP connections', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      mockFetch.mockReturnValue((async function* () {})());

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(ImapFlow).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true }),
      );
    });

    it('should disable imapflow logger', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      mockFetch.mockReturnValue((async function* () {})());

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(ImapFlow).toHaveBeenCalledWith(
        expect.objectContaining({ logger: false }),
      );
    });

    it('should handle no unseen messages gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      mockFetch.mockReturnValue((async function* () {})());

      await service.pollMailbox(
        mockChannelConfig.credentials as EmailCredentials,
        mockClientAgent as unknown as ClientAgent,
      );

      expect(clientAgentRepository.findOneByEmail).not.toHaveBeenCalled();
      expect(mockMessageFlagsAdd).not.toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  // ─── handleIncoming ─────────────────────────────────────────────────────

  describe('handleIncoming', () => {
    it('should log incoming email with from and to', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(null);

      await service.handleIncoming(
        createDto({ from: 'alice@test.com', to: 'bot@test.com' }),
      );

      expect(loggerLogSpy).toHaveBeenCalledWith(
        '[Email] Incoming email from=alice@test.com to=bot@test.com',
      );
    });

    it('should look up agent channel by recipient email', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(null);

      await service.handleIncoming(createDto({ to: 'lookup@example.com' }));

      expect(clientAgentRepository.findOneByEmail).toHaveBeenCalledWith(
        'lookup@example.com',
      );
    });

    it('should log warning when no agent found for email', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(null);

      await service.handleIncoming(createDto({ to: 'unknown@example.com' }));

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[Email] No active ClientAgent found for email=unknown@example.com. Check if channel exists and is active.',
      );
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should not call agentRepository when no agent found', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(null);

      await service.handleIncoming(createDto());

      expect(agentRepository.findActiveById).not.toHaveBeenCalled();
    });

    it('should not send email when no agent found', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(null);

      await service.handleIncoming(createDto());

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should log warning when channel config not found in agent', async () => {
      // Agent exists but no matching channel for this email
      const mismatchedAgent = {
        ...mockClientAgent,
        channels: [],
      };
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mismatchedAgent as any,
      );

      await service.handleIncoming(createDto({ to: 'support@example.com' }));

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[Email] Channel config not found in ClientAgent for email=support@example.com (mismatch).',
      );
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should run agent service with correct context and input', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      const dto = createDto({
        from: 'user@example.com',
        to: 'support@example.com',
        subject: 'Help me',
        text: 'I have an issue',
        messageId: 'msg-123',
      });

      await service.handleIncoming(dto);

      expect(agentRepository.findActiveById).toHaveBeenCalledWith('agent-1');
      expect(agentService.run).toHaveBeenCalledWith(
        {
          channel: 'email',
          externalUserId: 'user@example.com',
          conversationId: 'support@example.com:user@example.com',
          message: {
            type: 'text',
            text: 'I have an issue',
          },
          metadata: {
            subject: 'Help me',
            messageId: 'msg-123',
          },
        },
        {
          agentId: 'agent-1',
          clientId: 'client-1',
          systemPrompt: 'You are a helpful assistant.',
          llmConfig: {
            provider: 'openai',
            apiKey: 'sk-mock-key',
            model: 'gpt-4',
          },
          channelConfig: mockChannelConfig.credentials,
        },
      );
    });

    it('should use default system prompt if agent has none', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue({
        ...mockAgent,
        systemPrompt: undefined,
      } as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.handleIncoming(createDto());

      expect(agentService.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          systemPrompt: undefined,
        }),
      );
    });

    it('should send reply email if agent returns a reply', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Hello there' },
      });

      await service.handleIncoming(
        createDto({
          from: 'user@example.com',
          to: 'support@example.com',
          subject: 'Inquiry',
        }),
      );

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'support@example.com',
        to: 'user@example.com',
        subject: 'Re: Inquiry',
        text: 'Hello there',
      });
    });

    it('should prepend "Re: " to subject in reply', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.handleIncoming(createDto({ subject: 'Account Issue' }));

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Re: Account Issue' }),
      );
    });

    it('should send reply to original sender', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.handleIncoming(createDto({ from: 'customer@test.com' }));

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'customer@test.com' }),
      );
    });

    it('should send from the channel configured email', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.handleIncoming(createDto());

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'support@example.com' }),
      );
    });

    it('should log when sending reply', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.handleIncoming(createDto({ from: 'recipient@test.com' }));

      expect(loggerLogSpy).toHaveBeenCalledWith(
        '[Email] Sending reply to recipient@test.com',
      );
    });

    it('should not send email when reply is undefined', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({});

      await service.handleIncoming(createDto());

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should not send email when reply is null', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({ reply: null });

      await service.handleIncoming(createDto());

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should skip processing when agent is not active', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(null);

      await service.handleIncoming(createDto());

      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should use default SMTP config when not provided in channelConfig', async () => {
      const minimalConfig = {
        ...mockChannelConfig,
        credentials: { email: 'support@example.com', password: 'secret' },
      };

      const minimalClientAgent = {
        ...mockClientAgent,
        channels: [minimalConfig],
      };

      clientAgentRepository.findOneByEmail.mockResolvedValue(
        minimalClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Hello' },
      });

      await service.handleIncoming(createDto());

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.gmail.com',
          port: 587,
        }),
      );
    });

    it('should propagate sendMail errors', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      mockSendMail.mockRejectedValue(new Error('SMTP auth failed'));

      await expect(service.handleIncoming(createDto())).rejects.toThrow(
        'Email send failed: SMTP auth failed',
      );
    });

    it('should log error when sendMail fails', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      mockSendMail.mockRejectedValue(new Error('Connection refused'));

      await expect(service.handleIncoming(createDto())).rejects.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send email: Connection refused'),
      );
    });

    it('should log success after sending email', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.handleIncoming(createDto({ from: 'user@test.com' }));

      expect(loggerLogSpy).toHaveBeenCalledWith(
        '[Email] Message sent successfully to user@test.com',
      );
    });

    it('should use secure: false for SMTP transport', async () => {
      clientAgentRepository.findOneByEmail.mockResolvedValue(
        mockClientAgent as any,
      );
      agentRepository.findActiveById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({
        reply: { type: 'text', text: 'Reply' },
      });

      await service.handleIncoming(createDto());

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false }),
      );
    });
  });
});
