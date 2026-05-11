import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { ChannelsService } from './channels.service';

/**
 * Read-only API for channel catalog (channels are created via seed).
 * Both admin roles can read.
 */
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Roles('super_admin', 'support')
  @Get()
  findAll() {
    return this.channelsService.findAll();
  }

  @Roles('super_admin', 'support')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.channelsService.findOne(id);
  }
}
