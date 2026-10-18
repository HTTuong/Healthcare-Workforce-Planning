import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { type EmployeeInput, EmployeesService } from './employees.service.js';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.findOne(id);
  }

  @Post()
  create(@Body() body: EmployeeInput) {
    return this.employeesService.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: EmployeeInput) {
    return this.employeesService.update(id, body ?? {});
  }

  @Put(':id/qualifications/:qualificationId')
  assignQualification(
    @Param('id', ParseIntPipe) id: number,
    @Param('qualificationId', ParseIntPipe) qualificationId: number,
    @Body() body: { validUntil?: unknown }
  ) {
    return this.employeesService.assignQualification(id, qualificationId, body?.validUntil);
  }

  @Delete(':id/qualifications/:qualificationId')
  @HttpCode(204)
  removeQualification(
    @Param('id', ParseIntPipe) id: number,
    @Param('qualificationId', ParseIntPipe) qualificationId: number
  ) {
    return this.employeesService.removeQualification(id, qualificationId);
  }
}