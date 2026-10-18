import { Body, Controller, Get, Post } from '@nestjs/common';
import { QualificationsService } from './qualifications.service.js';

@Controller('qualifications')
export class QualificationsController {
  constructor(private readonly qualificationsService: QualificationsService) {}

  @Get()
  findAll() {
    return this.qualificationsService.findAll();
  }

  @Post()
  create(@Body() body: { code?: unknown; name?: unknown }) {
    return this.qualificationsService.create(body?.code, body?.name);
  }
}