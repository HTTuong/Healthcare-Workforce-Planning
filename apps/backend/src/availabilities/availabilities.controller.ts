import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { type AvailabilityInput, AvailabilitiesService } from './availabilities.service.js';
import { ANY_ROLE } from '../auth/role-sets.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('availabilities')
export class AvailabilitiesController {
  constructor(private readonly availabilitiesService: AvailabilitiesService) {}

  @Roles(...ANY_ROLE)
  @Get()
  findAll(@Query('employeeId', new ParseIntPipe({ optional: true })) employeeId?: number) {
    return this.availabilitiesService.findAll(employeeId);
  }

  @Roles(...ANY_ROLE)
  @Post()
  create(@Body() body: AvailabilityInput) {
    return this.availabilitiesService.create(body ?? {});
  }

  @Roles(...ANY_ROLE)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: AvailabilityInput) {
    return this.availabilitiesService.update(id, body ?? {});
  }

  @Roles(...ANY_ROLE)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.availabilitiesService.remove(id);
  }
}