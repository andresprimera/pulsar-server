import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { PersonalitiesService } from './personalities.service';
import { CreatePersonalityDto } from './dto/create-personality.dto';
import { UpdatePersonalityDto } from './dto/update-personality.dto';
import { UpdatePersonalityStatusDto } from './dto/update-personality-status.dto';
import { PersonalityQueryDto } from './dto/personality-query.dto';

/**
 * Internal/admin API for personality management.
 */
@Controller('personalities')
export class PersonalitiesController {
  constructor(private readonly personalitiesService: PersonalitiesService) {}

  @Post()
  create(@Body() dto: CreatePersonalityDto) {
    return this.personalitiesService.create(dto);
  }

  @Get()
  findAll(@Query() query: PersonalityQueryDto) {
    return this.personalitiesService.findAll(query.status);
  }

  @Get('available')
  findAvailable() {
    return this.personalitiesService.findAvailable();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.personalitiesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePersonalityDto) {
    return this.personalitiesService.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePersonalityStatusDto,
  ) {
    return this.personalitiesService.updateStatus(id, dto);
  }
}
