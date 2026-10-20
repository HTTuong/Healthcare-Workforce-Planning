import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { type ShiftInput, ShiftsService } from './shifts.service.js';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  findAll(@Query('departmentId', new ParseIntPipe({ optional: true })) departmentId?: number) {
    return this.shiftsService.findAll(departmentId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.shiftsService.findOne(id);
  }

  @Post()
  create(@Body() body: ShiftInput) {
    return this.shiftsService.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ShiftInput) {
    return this.shiftsService.update(id, body ?? {});
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.shiftsService.remove(id);
  }

  @Put(':id/requirements/:qualificationId')
  setRequirement(
    @Param('id', ParseIntPipe) id: number,
    @Param('qualificationId', ParseIntPipe) qualificationId: number,
    @Body() body: { count?: unknown }
  ) {
    return this.shiftsService.setRequirement(id, qualificationId, body?.count);
  }

  @Delete(':id/requirements/:qualificationId')
  @HttpCode(204)
  removeRequirement(
    @Param('id', ParseIntPipe) id: number,
    @Param('qualificationId', ParseIntPipe) qualificationId: number
  ) {
    return this.shiftsService.removeRequirement(id, qualificationId);
  }
}