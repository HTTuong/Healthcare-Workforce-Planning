import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Put } from '@nestjs/common';
import { StaffingRequirementsService } from './staffing-requirements.service.js';

@Controller('departments/:departmentId/staffing-requirements')
export class StaffingRequirementsController {
  constructor(private readonly staffingRequirementsService: StaffingRequirementsService) {}

  @Get()
  findAll(@Param('departmentId', ParseIntPipe) departmentId: number) {
    return this.staffingRequirementsService.findAll(departmentId);
  }

  @Put(':shiftType')
  set(
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Param('shiftType') shiftType: string,
    @Body() body: { minHeadcount?: unknown }
  ) {
    return this.staffingRequirementsService.set(departmentId, shiftType, body?.minHeadcount);
  }

  @Delete(':shiftType')
  @HttpCode(204)
  remove(@Param('departmentId', ParseIntPipe) departmentId: number, @Param('shiftType') shiftType: string) {
    return this.staffingRequirementsService.remove(departmentId, shiftType);
  }
}