import { Module } from '@nestjs/common';
import { MessagePersistenceService } from '@persistence/message-persistence.service';
import { AgentRoutingService } from '@domain/routing/agent-routing.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@persistence/database.module';
import { ContactIdentifierExtractorRegistry } from './contact-identifier/contact-identifier-extractor.registry';
import { ContactIdentityResolver } from './contact-identity.resolver';
import { WhatsappIdentifierExtractor } from './contact-identifier/whatsapp-identifier.extractor';
import { InstagramIdentifierExtractor } from './contact-identifier/instagram-identifier.extractor';
import { TelegramIdentifierExtractor } from './contact-identifier/telegram-identifier.extractor';
import { TiktokIdentifierExtractor } from './contact-identifier/tiktok-identifier.extractor';
import { WebIdentifierExtractor } from './contact-identifier/web-identifier.extractor';
import { ApiIdentifierExtractor } from './contact-identifier/api-identifier.extractor';
import { CONTACT_IDENTIFIER_EXTRACTORS } from './contact-identifier/contact-identifier-extractor.interface';
import { ConversationService } from '@domain/conversation/conversation.service';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    MessagePersistenceService,
    ConversationService,
    AgentRoutingService,
    ContactIdentityResolver,
    ContactIdentifierExtractorRegistry,
    WhatsappIdentifierExtractor,
    InstagramIdentifierExtractor,
    TelegramIdentifierExtractor,
    TiktokIdentifierExtractor,
    WebIdentifierExtractor,
    ApiIdentifierExtractor,
    {
      provide: CONTACT_IDENTIFIER_EXTRACTORS,
      useFactory: (
        whatsappExtractor: WhatsappIdentifierExtractor,
        instagramExtractor: InstagramIdentifierExtractor,
        telegramExtractor: TelegramIdentifierExtractor,
        tiktokExtractor: TiktokIdentifierExtractor,
        webExtractor: WebIdentifierExtractor,
        apiExtractor: ApiIdentifierExtractor,
      ) => [
        whatsappExtractor,
        instagramExtractor,
        telegramExtractor,
        tiktokExtractor,
        webExtractor,
        apiExtractor,
      ],
      inject: [
        WhatsappIdentifierExtractor,
        InstagramIdentifierExtractor,
        TelegramIdentifierExtractor,
        TiktokIdentifierExtractor,
        WebIdentifierExtractor,
        ApiIdentifierExtractor,
      ],
    },
  ],
  exports: [
    MessagePersistenceService,
    ConversationService,
    AgentRoutingService,
    ContactIdentityResolver,
    ContactIdentifierExtractorRegistry,
  ],
})
export class SharedChannelModule {}
