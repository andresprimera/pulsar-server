import { Module } from '@nestjs/common';
import { AgentRoutingService } from './routing/agent-routing.service';
import { ConversationService } from './conversation/conversation.service';
import { ContactIdentifierExtractorRegistry } from './channels/contact-identifier/contact-identifier-extractor.registry';
import { WhatsappIdentifierExtractor } from './channels/contact-identifier/whatsapp-identifier.extractor';
import { InstagramIdentifierExtractor } from './channels/contact-identifier/instagram-identifier.extractor';
import { TelegramIdentifierExtractor } from './channels/contact-identifier/telegram-identifier.extractor';
import { TiktokIdentifierExtractor } from './channels/contact-identifier/tiktok-identifier.extractor';
import { WebIdentifierExtractor } from './channels/contact-identifier/web-identifier.extractor';
import { ApiIdentifierExtractor } from './channels/contact-identifier/api-identifier.extractor';
import { CONTACT_IDENTIFIER_EXTRACTORS } from './channels/contact-identifier/contact-identifier-extractor.interface';
import { CONTACT_IDENTIFIER_REGISTRY } from './channels/contact-identifier.interface';

@Module({
  providers: [
    AgentRoutingService,
    ConversationService,
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
    {
      provide: CONTACT_IDENTIFIER_REGISTRY,
      useExisting: ContactIdentifierExtractorRegistry,
    },
  ],
  exports: [
    AgentRoutingService,
    ConversationService,
    CONTACT_IDENTIFIER_REGISTRY,
  ],
})
export class DomainModule {}
