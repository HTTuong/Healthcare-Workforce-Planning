import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { type EmployeeInput, EmployeesService } from './employees.service.js';
import { STAFF_ROLES } from '../auth/role-sets.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Roles(...STAFF_ROLES)
  @Get()
  findAll() {
    return this.employeesService.findAll();
  }

  @Roles(...STAFF_ROLES)
  @Get(':id')
  findOne(@Param('id', ParseIdPipe) id: number) {
    return this.employeesService.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() body: EmployeeInput) {
    return this.employeesService.create(body ?? {});
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIdPipe) id: number, @Body() body: EmployeeInput) {
    return this.employeesService.update(id, body ?? {});
  }

  @Roles('ADMIN')
  @Put(':id/qualifications/:qualificationId')
  assignQualification(
    @Param('id', ParseIdPipe) id: number,
    @Param('qualificationId', ParseIdPipe) qualificationId: number,
    @Body() body: { validUntil?: unknown }
  ) {
    return this.employeesService.assignQualification(id, qualificationId, body?.validUntil);
  }

  @Roles('ADMIN')
  @Delete(':id/qualifications/:qualificationId')
  @HttpCode(204)
  removeQualification(
    @Param('id', ParseIdPipe) id: number,
    @Param('qualificationId', ParseIdPipe) qualificationId: number
  ) {
    return this.employeesService.removeQualification(id, qualificationId);
  }
}