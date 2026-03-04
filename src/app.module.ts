import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { DatabaseModule } from './core/persistence/database.module';
import { WhatsappModule } from './core/channels/whatsapp/whatsapp.module';
import { TiktokModule } from './core/channels/tiktok/tiktok.module';
import { InstagramModule } from './core/channels/instagram/instagram.module';
import { AgentsModule } from './features/agents/agents.module';
import { UsersModule } from './features/users/users.module';
import { ClientsModule } from './features/clients/clients.module';
import { ClientAgentsModule } from './features/client-agents/client-agents.module';
import { OnboardingModule } from './features/onboarding/onboarding.module';

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
