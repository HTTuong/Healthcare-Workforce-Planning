import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';
import { ANY_ROLE } from '../auth/role-sets.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('departments')
export class DepartmentsController {
  // Nest injects the singleton DepartmentsService here.
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Roles(...ANY_ROLE)
  @Get()
  findAll() {
    return this.departmentsService.findAll();
  }

  @Roles(...ANY_ROLE)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() body: { code: string; name: string }) {
    return this.departmentsService.create(body.code, body.name);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: { code?: unknown; name?: unknown }) {
    return this.departmentsService.update(id, body ?? {});
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.remove(id);
  }
}
