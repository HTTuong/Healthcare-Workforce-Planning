import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ANY_ROLE, STAFF_ROLES } from '../auth/role-sets.js';
import { Roles } from '../auth/roles.decorator.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { WORKFLOW } from './schedule-workflow.js';
import { type AssignmentInput, type ScheduleInput, SchedulesService } from './schedules.service.js';

// The roles of every workflow action come from the WORKFLOW table, the same table the service uses for statuses.
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Roles(...ANY_ROLE)
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('departmentId', new ParseIdPipe({ optional: true })) departmentId?: number) {
    return this.schedulesService.findAll(user, departmentId);
  }

  @Roles(...ANY_ROLE)
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.schedulesService.findOne(id, user);
  }

  @Roles(...STAFF_ROLES)
  @Get(':id/check')
  check(@Param('id', ParseIdPipe) id: number) {
    return this.schedulesService.check(id);
  }

  @Roles(...WORKFLOW.edit.roles)
  @Post()
  create(@Body() body: ScheduleInput) {
    return this.schedulesService.create(body ?? {});
  }

  @Roles(...WORKFLOW.edit.roles)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIdPipe) id: number) {
    return this.schedulesService.remove(id);
  }

  @Roles(...WORKFLOW.generate.roles)
  @Post(':id/generate')
  @HttpCode(200)
  generate(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.schedulesService.generate(id, user);
  }

  @Roles(...WORKFLOW.edit.roles)
  @Post(':id/assignments')
  addAssignment(@Param('id', ParseIdPipe) id: number, @Body() body: AssignmentInput) {
    return this.schedulesService.addAssignment(id, body ?? {});
  }

  @Roles(...WORKFLOW.edit.roles)
  @Delete(':id/assignments/:assignmentId')
  @HttpCode(204)
  removeAssignment(@Param('id', ParseIdPipe) id: number, @Param('assignmentId', ParseIdPipe) assignmentId: number) {
    return this.schedulesService.removeAssignment(id, assignmentId);
  }

  @Roles(...WORKFLOW.submit.roles)
  @Post(':id/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.schedulesService.move(id, 'submit', user);
  }

  @Roles(...WORKFLOW.approve.roles)
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.schedulesService.approve(id, user);
  }

  @Roles(...WORKFLOW.reject.roles)
  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.schedulesService.move(id, 'reject', user);
  }

  @Roles(...WORKFLOW.publish.roles)
  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.schedulesService.move(id, 'publish', user);
  }
}
