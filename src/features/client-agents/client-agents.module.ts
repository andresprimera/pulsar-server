import { Module } from '@nestjs/common';
import { ClientAgentsService } from './client-agents.service';
import { ClientAgentsController } from './client-agents.controller';
import { ClientAgentsClientController } from './client-agents.client.controller';
import { DatabaseModule } from '@persistence/database.module';
import { ClientsModule } from '@clients/clients.module';
import { AgentsModule } from '@agents/agents.module';
import { OrchestratorModule } from '@orchestrator/orchestrator.module';

@Module({
  imports: [DatabaseModule, ClientsModule, AgentsModule, OrchestratorModule],
  controllers: [ClientAgentsController, ClientAgentsClientController],
  providers: [ClientAgentsService],
})
export class ClientAgentsModule {}
