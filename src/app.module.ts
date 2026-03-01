import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { DatabaseModule } from './persistence/database.module';
import { WhatsappModule } from './channels/whatsapp/whatsapp.module';
import { TiktokModule } from './channels/tiktok/tiktok.module';
import { InstagramModule } from './channels/instagram/instagram.module';
import { AgentsModule } from './agents/agents.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';

import { ClientAgentsModule } from './client-agents/client-agents.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    WhatsappModule,
    TiktokModule,
    InstagramModule,
    AgentsModule,
    UsersModule,
    ClientsModule,
    ClientAgentsModule,
    OnboardingModule,
  ],

  controllers: [AppController],
})
export class AppModule {}
