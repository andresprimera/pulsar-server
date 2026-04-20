import { Injectable, Logger } from '@nestjs/common';
import type { ToolSet } from 'ai';
import {
  CHAT_STANDARD_TOOLING_PROFILE_ID,
  type AgentToolingProfileId,
} from '@shared/agent-tooling-profile.constants';
import type { AgentToolRunCorrelation } from './agent-tool-run-correlation';
import { createAgentDebugLogTool } from './create-agent-debug-log.tool';
import { createListClientCatalogTool } from './list-client-catalog.tool';
import { ClientCatalogItemRepository } from '@persistence/repositories/client-catalog-item.repository';
import { ClientRepository } from '@persistence/repositories/client.repository';

@Injectable()
export class AgentToolSetBuilderService {
  private readonly logger = new Logger(AgentToolSetBuilderService.name);

  constructor(
    private readonly clientCatalogItemRepository: ClientCatalogItemRepository,
    private readonly clientRepository: ClientRepository,
  ) {}

  buildToolSet(
    profileId: AgentToolingProfileId,
    correlation: AgentToolRunCorrelation,
  ): ToolSet {
    switch (profileId) {
      case CHAT_STANDARD_TOOLING_PROFILE_ID:
        return {};
      case 'internal-debug':
        return {
          agent_debug_log: createAgentDebugLogTool(this.logger, correlation),
        };
      case 'sales-catalog':
        return {
          list_client_catalog: createListClientCatalogTool(
            correlation,
            this.clientCatalogItemRepository,
            this.clientRepository,
          ),
        };
      default:
        this.logger.error(`Unhandled tooling profile: ${String(profileId)}`);
        return {};
    }
  }
}
