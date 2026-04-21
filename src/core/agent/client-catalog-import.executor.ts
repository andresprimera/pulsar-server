import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateObject, type LanguageModel, type UserContent } from 'ai';
import { createLLMModel } from './llm/llm.factory';
import {
  catalogImportLlmBatchSchema,
  type CatalogImportLlmBatch,
} from '@shared/client-catalog-item.contract';
import type { ClientCatalogItemUpsert } from '@shared/client-catalog-item.contract';
import type { CatalogImportLlmBatchInput } from './contracts/catalog-import-llm.input';

type CatalogImportGenerateObjectArgs = {
  model: LanguageModel;
  schema: typeof catalogImportLlmBatchSchema;
  schemaName?: string;
  schemaDescription?: string;
  system: string;
  messages: Array<{ role: 'user'; content: UserContent }>;
};

const generateCatalogImportObject = generateObject as unknown as (
  args: CatalogImportGenerateObjectArgs,
) => Promise<{ object: CatalogImportLlmBatch }>;

@Injectable()
export class ClientCatalogImportExecutor {
  private readonly logger = new Logger(ClientCatalogImportExecutor.name);

  private static readonly SYSTEM_PROMPT =
    'You extract structured catalog items for a commerce system. ' +
    'Return ONLY JSON matching the schema. ' +
    'Each item must have sku, name, and type (product or service). ' +
    'Optional: description, unitAmountMinor (non-negative integer minor units), currency (ISO 4217, required when unitAmountMinor is set). ' +
    'Do not invent SKUs or products that are not supported by the supplied content. ' +
    'If the batch text is ambiguous, still produce the best-effort items you can justify from the text alone.';

  async extractBatch(
    input: CatalogImportLlmBatchInput,
  ): Promise<ClientCatalogItemUpsert[]> {
    const model = createLLMModel(input.llmConfig);

    const userContent: UserContent = [{ type: 'text', text: input.userText }];
    for (const file of input.attachments ?? []) {
      const mime = file.mimeType.toLowerCase();
      if (mime.startsWith('image/')) {
        userContent.push({
          type: 'image',
          image: file.buffer,
          mediaType: mime,
        });
      } else {
        userContent.push({
          type: 'file',
          data: file.buffer,
          mediaType: mime,
          filename: file.filename,
        });
      }
    }

    try {
      const result = await generateCatalogImportObject({
        model,
        schema: catalogImportLlmBatchSchema,
        schemaName: 'CatalogImportBatch',
        schemaDescription:
          'Batch of catalog line items extracted from the supplied file or text.',
        system: ClientCatalogImportExecutor.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });
      const batch = catalogImportLlmBatchSchema.parse(result.object);
      return batch.items;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      const message =
        err instanceof Error ? err.message : 'Catalog LLM extraction failed';
      this.logger.warn(`catalog import generateObject failed: ${message}`);
      throw new HttpException(
        'Catalog extraction failed upstream',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
