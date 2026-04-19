import { Global, Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Client, ClientSchema } from './schemas/client.schema';
import { Agent, AgentSchema } from './schemas/agent.schema';
import { Channel, ChannelSchema } from './schemas/channel.schema';
import { ClientAgent, ClientAgentSchema } from './schemas/client-agent.schema';

import { ClientPhone, ClientPhoneSchema } from './schemas/client-phone.schema';
import { Contact, ContactSchema } from './schemas/contact.schema';
import { ClientRepository } from './repositories/client.repository';
import { AgentRepository } from './repositories/agent.repository';
import { ChannelRepository } from './repositories/channel.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';

import { ClientPhoneRepository } from './repositories/client-phone.repository';
import { ContactRepository } from './repositories/contact.repository';
import { SeederService } from './seeder.service';
import { ChannelCatalogSeederService } from './channel-catalog-seeder.service';
import { User, UserSchema } from './schemas/user.schema';
import { UserRepository } from './repositories/user.repository';
import { Message, MessageSchema } from './schemas/message.schema';
import { MessageRepository } from './repositories/message.repository';
import {
  Conversation,
  ConversationSchema,
} from './schemas/conversation.schema';
import { ConversationRepository } from './repositories/conversation.repository';
import {
  ProcessedEvent,
  ProcessedEventSchema,
} from './schemas/processed-event.schema';
import { ProcessedEventRepository } from './repositories/processed-event.repository';
import { LlmUsageLog, LlmUsageLogSchema } from './schemas/llm-usage-log.schema';
import { LlmUsageLogRepository } from './repositories/llm-usage-log.repository';
import { AgentPrice, AgentPriceSchema } from './schemas/agent-price.schema';
import { AgentPriceRepository } from './repositories/agent-price.repository';
import {
  ChannelPrice,
  ChannelPriceSchema,
} from './schemas/channel-price.schema';
import { ChannelPriceRepository } from './repositories/channel-price.repository';
import {
  BillingRecord,
  BillingRecordSchema,
} from './schemas/billing-record.schema';
import { BillingRecordRepository } from './repositories/billing-record.repository';
import { Personality, PersonalitySchema } from './schemas/personality.schema';
import { PersonalityRepository } from './repositories/personality.repository';
import { EventIdempotencyService } from './event-idempotency.service';
import { OnboardingModule } from '@onboarding/onboarding.module';

const repositories = [
  ClientRepository,
  AgentRepository,
  ChannelRepository,
  ClientAgentRepository,
  PersonalityRepository,
  AgentPriceRepository,
  ChannelPriceRepository,
  BillingRecordRepository,
  ClientPhoneRepository,
  ContactRepository,
  UserRepository,
  MessageRepository,
  ConversationRepository,
  ProcessedEventRepository,
  LlmUsageLogRepository,
];

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGODB_URI') ||
          'mongodb://localhost:27017/pulsar',
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Agent.name, schema: AgentSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: ClientAgent.name, schema: ClientAgentSchema },
      { name: Personality.name, schema: PersonalitySchema },

      { name: ClientPhone.name, schema: ClientPhoneSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: User.name, schema: UserSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: ProcessedEvent.name, schema: ProcessedEventSchema },
      { name: LlmUsageLog.name, schema: LlmUsageLogSchema },
      { name: AgentPrice.name, schema: AgentPriceSchema },
      { name: ChannelPrice.name, schema: ChannelPriceSchema },
      { name: BillingRecord.name, schema: BillingRecordSchema },
    ]),
    forwardRef(() => OnboardingModule),
  ],
  providers: [
    ...repositories,
    ChannelCatalogSeederService,
    SeederService,
    EventIdempotencyService,
  ],
  exports: [...repositories, EventIdempotencyService],
})
export class DatabaseModule {}
