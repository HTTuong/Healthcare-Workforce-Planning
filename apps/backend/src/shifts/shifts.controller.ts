import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { type ShiftInput, ShiftsService } from './shifts.service.js';
import { SCHEDULING_ROLES, STAFF_ROLES } from '../auth/role-sets.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Roles(...STAFF_ROLES)
  @Get()
  findAll(@Query('departmentId', new ParseIntPipe({ optional: true })) departmentId?: number) {
    return this.shiftsService.findAll(departmentId);
  }

  @Roles(...STAFF_ROLES)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.shiftsService.findOne(id);
  }

  @Roles(...SCHEDULING_ROLES)
  @Post()
  create(@Body() body: ShiftInput) {
    return this.shiftsService.create(body ?? {});
  }

  @Roles(...SCHEDULING_ROLES)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ShiftInput) {
    return this.shiftsService.update(id, body ?? {});
  }

  @Roles(...SCHEDULING_ROLES)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.shiftsService.remove(id);
  }

  @Roles(...SCHEDULING_ROLES)
  @Put(':id/requirements/:qualificationId')
  setRequirement(
    @Param('id', ParseIntPipe) id: number,
    @Param('qualificationId', ParseIntPipe) qualificationId: number,
    @Body() body: { count?: unknown }
  ) {
    return this.shiftsService.setRequirement(id, qualificationId, body?.count);
  }

  @Roles(...SCHEDULING_ROLES)
  @Delete(':id/requirements/:qualificationId')
  @HttpCode(204)
  removeRequirement(
    @Param('id', ParseIntPipe) id: number,
    @Param('qualificationId', ParseIntPipe) qualificationId: number
  ) {
    return this.shiftsService.removeRequirement(id, qualificationId);
  }
}