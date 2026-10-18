import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { type AvailabilityInput, AvailabilitiesService } from './availabilities.service.js';

@Controller('availabilities')
export class AvailabilitiesController {
  constructor(private readonly availabilitiesService: AvailabilitiesService) {}

  @Get()
  findAll(@Query('employeeId', new ParseIntPipe({ optional: true })) employeeId?: number) {
    return this.availabilitiesService.findAll(employeeId);
  }

  @Post()
  create(@Body() body: AvailabilityInput) {
    return this.availabilitiesService.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: AvailabilityInput) {
    return this.availabilitiesService.update(id, body ?? {});
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.availabilitiesService.remove(id);
  }
}