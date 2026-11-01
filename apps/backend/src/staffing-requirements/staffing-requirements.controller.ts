import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { StaffingRequirementsService } from './staffing-requirements.service.js';
import { SCHEDULING_ROLES, STAFF_ROLES } from '../auth/role-sets.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('departments/:departmentId/staffing-requirements')
export class StaffingRequirementsController {
  constructor(private readonly staffingRequirementsService: StaffingRequirementsService) {}

  @Roles(...STAFF_ROLES)
  @Get()
  findAll(@Param('departmentId', ParseIdPipe) departmentId: number) {
    return this.staffingRequirementsService.findAll(departmentId);
  }

  @Roles(...SCHEDULING_ROLES)
  @Put(':shiftType')
  set(
    @Param('departmentId', ParseIdPipe) departmentId: number,
    @Param('shiftType') shiftType: string,
    @Body() body: { minHeadcount?: unknown }
  ) {
    return this.staffingRequirementsService.set(departmentId, shiftType, body?.minHeadcount);
  }

  @Roles(...SCHEDULING_ROLES)
  @Delete(':shiftType')
  @HttpCode(204)
  remove(@Param('departmentId', ParseIdPipe) departmentId: number, @Param('shiftType') shiftType: string) {
    return this.staffingRequirementsService.remove(departmentId, shiftType);
  }
}