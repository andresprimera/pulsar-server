import { Module, Global } from '@nestjs/common';
import { ChannelEnvService } from './channel-env.service';
import { ChannelEnvValidator } from './channel-env.validator';

@Global()
@Module({
  providers: [ChannelEnvService, ChannelEnvValidator],
  exports: [ChannelEnvService],
})
export class ChannelConfigModule {}
