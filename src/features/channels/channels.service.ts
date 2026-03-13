import { Injectable, NotFoundException } from '@nestjs/common';
import { ChannelRepository } from '@persistence/repositories/channel.repository';

@Injectable()
export class ChannelsService {
  constructor(private readonly channelRepository: ChannelRepository) {}

  async findAll() {
    return this.channelRepository.findAll();
  }

  async findOne(id: string) {
    const channel = await this.channelRepository.findById(id);
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }
}
