import { Controller, Get, Param } from '@nestjs/common';
import { ChannelsService } from './channels.service';

/**
 * Read-only API for channel catalog (channels are created via seed).
 */
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  findAll() {
    return this.channelsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.channelsService.findOne(id);
  }
}
