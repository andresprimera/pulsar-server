import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { generateText } from 'ai';
import { ClientContextSuggestionExecutor } from './client-context-suggestion.executor';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

describe('ClientContextSuggestionExecutor', () => {
  let executor: ClientContextSuggestionExecutor;

  beforeEach(async () => {
    jest.mocked(generateText).mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientContextSuggestionExecutor],
    }).compile();
    executor = module.get(ClientContextSuggestionExecutor);
  });

  describe('generateCompanyBriefMarkdown', () => {
    it('should throw BadRequestException when OPENAI_API_KEY missing', async () => {
      const prev = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await expect(
        executor.generateCompanyBriefMarkdown({ attachments: [] }),
      ).rejects.toThrow(BadRequestException);

      process.env.OPENAI_API_KEY = prev;
    });

    it('should return trimmed text', async () => {
      const prev = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test';
      jest.mocked(generateText).mockResolvedValue({
        text: '  ## Hi\n\nThere  ',
      } as Awaited<ReturnType<typeof generateText>>);

      const result = await executor.generateCompanyBriefMarkdown({
        organizationName: 'Acme',
        attachments: [],
      });

      expect(result).toEqual({ suggestedText: '## Hi\n\nThere' });
      process.env.OPENAI_API_KEY = prev;
    });

    it('should throw HttpException BAD_GATEWAY on empty model output', async () => {
      const prev = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test';
      jest.mocked(generateText).mockResolvedValue({
        text: '   ',
      } as Awaited<ReturnType<typeof generateText>>);

      await expect(
        executor.generateCompanyBriefMarkdown({ attachments: [] }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_GATEWAY });

      process.env.OPENAI_API_KEY = prev;
    });
  });
});
