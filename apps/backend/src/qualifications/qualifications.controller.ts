import { Body, Controller, Get, Post } from '@nestjs/common';
import { QualificationsService } from './qualifications.service.js';
import { ANY_ROLE } from '../auth/role-sets.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('qualifications')
export class QualificationsController {
  constructor(private readonly qualificationsService: QualificationsService) {}

  @Roles(...ANY_ROLE)
  @Get()
  findAll() {
    return this.qualificationsService.findAll();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() body: { code?: unknown; name?: unknown }) {
    return this.qualificationsService.create(body?.code, body?.name);
  }
}