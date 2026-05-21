import { Module } from '@nestjs/common';
import { DatabaseModule } from '@persistence/database.module';
import { DomainModule } from '@domain/domain.module';
import { MessagingGatewayModule } from '@channels/gateway/messaging-gateway.module';
import { InboxService } from './inbox.service';
import { InboxOperatorMessageService } from './inbox-operator-message.service';
import { InboxConversationMutationService } from './inbox-conversation-mutation.service';
import { InboxController } from './inbox.client.controller';

@Module({
  imports: [DatabaseModule, DomainModule, MessagingGatewayModule],
  controllers: [InboxController],
  providers: [
    InboxService,
    InboxOperatorMessageService,
    InboxConversationMutationService,
  ],
})
export class InboxModule {}
