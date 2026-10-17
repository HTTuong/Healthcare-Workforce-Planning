import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
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
}
