import { Injectable, Logger } from '@nestjs/common';
import type { ToolSet } from 'ai';
import {
  CHAT_STANDARD_TOOLING_PROFILE_ID,
  SALES_CATALOG_TOOLING_PROFILE_ID,
  type AgentToolingProfileId,
} from '@shared/agent-tooling-profile.constants';
import type { AgentToolRunCorrelation } from './agent-tool-run-correlation';
import { createAgentDebugLogTool } from './create-agent-debug-log.tool';

@Injectable()
export class AgentToolSetBuilderService {
  private readonly logger = new Logger(AgentToolSetBuilderService.name);

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
      case SALES_CATALOG_TOOLING_PROFILE_ID:
        return {};
      default:
        this.logger.error(`Unhandled tooling profile: ${String(profileId)}`);
        return {};
    }
  }
}
