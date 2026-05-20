import { Module } from '@nestjs/common';
import { DatabaseModule } from '@persistence/database.module';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.client.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
