import { Module } from '@nestjs/common';
import { StaffingRequirementsController } from './staffing-requirements.controller.js';
import { StaffingRequirementsService } from './staffing-requirements.service.js';

@Module({
  controllers: [StaffingRequirementsController],
  providers: [StaffingRequirementsService]
})
export class StaffingRequirementsModule {}