import { Test, TestingModule } from '@nestjs/testing';
import { ClientContextSuggestionService } from './client-context-suggestion.service';
import { AgentService } from '@agent/agent.service';

describe('ClientContextSuggestionService', () => {
  let service: ClientContextSuggestionService;
  let agentService: jest.Mocked<
    Pick<
      AgentService,
      'suggestCompanyBriefMarkdown' | 'suggestPromptSupplementMarkdown'
    >
  >;

  beforeEach(async () => {
    agentService = {
      suggestCompanyBriefMarkdown: jest.fn(),
      suggestPromptSupplementMarkdown: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientContextSuggestionService,
        { provide: AgentService, useValue: agentService },
      ],
    }).compile();

    service = module.get<ClientContextSuggestionService>(
      ClientContextSuggestionService,
    );
  });

  describe('suggestCompanyBrief', () => {
    it('should reject unsupported MIME types', async () => {
      const badFile = {
        buffer: Buffer.from('x'),
        mimetype: 'application/octet-stream',
        originalname: 'x.bin',
      } as Express.Multer.File;

      return expect(service.suggestCompanyBrief({}, [badFile])).rejects.toThrow(
        'Unsupported file type',
      );
    });

    it('should delegate to AgentService', async () => {
      agentService.suggestCompanyBriefMarkdown.mockResolvedValue({
        suggestedText: '## About\n\nOK',
      });

      const result = await service.suggestCompanyBrief(
        { instructions: 'Hi', organizationName: 'Acme' },
        [],
      );

      expect(result).toEqual({ suggestedText: '## About\n\nOK' });
      expect(agentService.suggestCompanyBriefMarkdown).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationName: 'Acme',
          instructions: 'Hi',
          attachments: [],
        }),
      );
    });
  });

  describe('suggestPromptSupplement', () => {
    it('should reject unsupported MIME types', async () => {
      const badFile = {
        buffer: Buffer.from('x'),
        mimetype: 'application/octet-stream',
        originalname: 'x.bin',
      } as Express.Multer.File;

      return expect(
        service.suggestPromptSupplement({}, [badFile]),
      ).rejects.toThrow('Unsupported file type');
    });

    it('should delegate to AgentService', async () => {
      agentService.suggestPromptSupplementMarkdown.mockResolvedValue({
        suggestedText: '## Scope\n\nDone',
      });

      const result = await service.suggestPromptSupplement(
        { agentName: 'Bot', companyBrief: 'We sell shoes.' },
        [],
      );

      expect(result).toEqual({ suggestedText: '## Scope\n\nDone' });
      expect(agentService.suggestPromptSupplementMarkdown).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'Bot',
          companyBrief: 'We sell shoes.',
          attachments: [],
        }),
      );
    });
  });
});
