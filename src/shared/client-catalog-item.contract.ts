import { z } from 'zod';

/** Rows sent to the LLM per `generateObject` call (tunable). */
export const CATALOG_IMPORT_ROWS_PER_LLM_BATCH = 75;

/** Mongo `bulkWrite` chunk size for catalog upserts. */
export const CATALOG_IMPORT_DB_CHUNK_SIZE = 500;

/**
 * Single source of truth for catalog upsert rows (API + LLM + persistence).
 * Keep aligned with `CreateClientCatalogItemDto` / `ClientCatalogItem` schema.
 */
export const clientCatalogItemUpsertSchema = z
  .object({
    sku: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(200),
    type: z.enum(['product', 'service']),
    description: z.string().trim().max(4000).optional(),
    unitAmountMinor: z.coerce.number().int().min(0).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .transform((c) => c.toUpperCase())
      .optional(),
  })
  .superRefine((val, ctx) => {
    const hasPrice =
      val.unitAmountMinor !== undefined && val.unitAmountMinor !== null;
    if (hasPrice && (val.currency === undefined || val.currency === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'currency is required when unitAmountMinor is set',
        path: ['currency'],
      });
    }
  });

export type ClientCatalogItemUpsert = z.infer<
  typeof clientCatalogItemUpsertSchema
>;

export const catalogImportLlmBatchSchema = z.object({
  items: z
    .array(clientCatalogItemUpsertSchema)
    .min(1)
    .max(CATALOG_IMPORT_ROWS_PER_LLM_BATCH),
});

export type CatalogImportLlmBatch = z.infer<typeof catalogImportLlmBatchSchema>;

/** Tabular files must expose these columns (case-insensitive header names). */
export const CLIENT_CATALOG_TABULAR_REQUIRED_HEADERS = [
  'sku',
  'name',
  'type',
] as const;

export type ClientCatalogTabularRequiredHeader =
  (typeof CLIENT_CATALOG_TABULAR_REQUIRED_HEADERS)[number];

export function normalizeCatalogSku(raw: string): string {
  return String(raw ?? '').trim();
}

export function stableSerializeCatalogItem(
  item: ClientCatalogItemUpsert,
): string {
  const parsed = clientCatalogItemUpsertSchema.parse(item);
  return JSON.stringify(parsed);
}
