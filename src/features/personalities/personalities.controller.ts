import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { PersonalitiesService } from './personalities.service';
import { CreatePersonalityDto } from './dto/create-personality.dto';
import { UpdatePersonalityDto } from './dto/update-personality.dto';
import { UpdatePersonalityStatusDto } from './dto/update-personality-status.dto';
import { PersonalityQueryDto } from './dto/personality-query.dto';

/**
 * Internal/admin API for personality management. Default-deny via
 * `RolesGuard`: routes without an explicit `@Roles(...)` decorator are
 * super-admin-only.
 */
@Controller('personalities')
export class PersonalitiesController {
  constructor(private readonly personalitiesService: PersonalitiesService) {}

  @Post()
  create(@Body() dto: CreatePersonalityDto) {
    return this.personalitiesService.create(dto);
  }

  @Roles('super_admin', 'support')
  @Get()
  findAll(@Query() query: PersonalityQueryDto) {
    return this.personalitiesService.findAll(query.status);
  }

  @Roles('super_admin', 'support')
  @Get('available')
  findAvailable() {
    return this.personalitiesService.findAvailable();
  }

  @Roles('super_admin', 'support')
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
