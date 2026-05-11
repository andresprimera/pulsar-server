import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

/**
 * Internal/admin Users API. Default-deny via `RolesGuard`: routes without an
 * explicit `@Roles(...)` decorator are super-admin-only.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Roles('super_admin', 'support')
  @Get()
  findAll(@Query('status') status?: 'active' | 'inactive' | 'archived') {
    return this.usersService.findAll(status);
  }

  @Roles('super_admin', 'support')
  @Get('available')
  findAvailable() {
    return this.usersService.findAll('active');
  }

  @Roles('super_admin', 'support')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.usersService.updateStatus(id, dto);
  }
}
