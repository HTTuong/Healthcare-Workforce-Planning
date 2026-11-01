import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ANY_ROLE } from '../auth/role-sets.js';
import { Roles } from '../auth/roles.decorator.js';
import { type AvailabilityInput, AvailabilitiesService } from './availabilities.service.js';
import { AvailabilityAccess } from './availability-access.service.js';

@Controller('availabilities')
export class AvailabilitiesController {
  constructor(
    private readonly availabilitiesService: AvailabilitiesService,
    private readonly access: AvailabilityAccess
  ) {}

  @Roles(...ANY_ROLE)
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('employeeId', new ParseIntPipe({ optional: true })) employeeId?: number
  ) {
    return this.availabilitiesService.findInScope(await this.access.readScope(user, employeeId));
  }

  @Roles(...ANY_ROLE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: AvailabilityInput) {
    this.access.assertCanWriteFor(user, body?.employeeId);
    return this.availabilitiesService.create(body ?? {});
  }

  @Roles(...ANY_ROLE)
  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: AvailabilityInput) {
    await this.access.assertCanChangeRecord(user, id);
    return this.availabilitiesService.update(id, body ?? {});
  }

  @Roles(...ANY_ROLE)
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.access.assertCanChangeRecord(user, id);
    return this.availabilitiesService.remove(id);
  }
}
