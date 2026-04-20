import { tool } from 'ai';
import { z } from 'zod';
import type { AgentToolRunCorrelation } from './agent-tool-run-correlation';
import { sanitizeToolLogArgument } from './redact-tool-string.util';
import type { ClientCatalogItemRepository } from '@persistence/repositories/client-catalog-item.repository';
import type { ClientRepository } from '@persistence/repositories/client.repository';

function stripAsciiControls(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, '');
}

const inputSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  activeOnly: z.coerce.boolean().optional(),
});

/**
 * Read-only catalog listing for the sales agent tooling profile.
 * Tenant scope comes only from {@link AgentToolRunCorrelation.clientId}.
 */
export function createListClientCatalogTool(
  runCorrelation: AgentToolRunCorrelation,
  catalogItemRepository: ClientCatalogItemRepository,
  clientRepository: ClientRepository,
) {
  return tool({
    description:
      'List this client product/service catalog (paginated). Uses only the authenticated client context; do not try to pass a different client id.',
    inputSchema: inputSchema as never,
    execute: async (raw: unknown) => {
      const input = inputSchema.parse(raw);
      const page = input.page ?? 1;
      const limit = input.limit ?? 25;
      const activeOnly = input.activeOnly ?? true;

      const client = await clientRepository.findById(runCorrelation.clientId);
      if (!client || client.status !== 'active') {
        return { page, limit, total: 0, items: [] };
      }

      const { items, total } = await catalogItemRepository.findByClientPaged(
        runCorrelation.clientId,
        { page, limit, activeOnly },
      );

      const mapped = items.map((row) => {
        const descriptionRaw = row.description ?? '';
        const description = descriptionRaw
          ? stripAsciiControls(sanitizeToolLogArgument(descriptionRaw, 500))
          : '';
        return {
          id: String(row._id),
          sku: row.sku,
          name: row.name,
          description,
          unitAmountMinor: row.unitAmountMinor ?? null,
          currency: row.currency ?? null,
          active: row.active,
          type: row.type,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      });

      return {
        page,
        limit,
        total,
        items: mapped,
      };
    },
  });
}
