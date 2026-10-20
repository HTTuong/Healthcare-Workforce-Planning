import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';

@Controller('departments')
export class DepartmentsController {
  // Nest injects the singleton DepartmentsService here.
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  findAll() {
    return this.departmentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.findOne(id);
  }

  @Post()
  create(@Body() body: { code: string; name: string }) {
    return this.departmentsService.create(body.code, body.name);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: { code?: unknown; name?: unknown }) {
    return this.departmentsService.update(id, body ?? {});
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.remove(id);
  }
}
