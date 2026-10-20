import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DepartmentsModule } from './departments/departments.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QualificationsModule } from './qualifications/qualifications.module.js';
import { AvailabilitiesModule } from './availabilities/availabilities.module.js';
import { ShiftsModule } from './shifts/shifts.module.js';
import { StaffingRequirementsModule } from './staffing-requirements/staffing-requirements.module.js';

@Module({
  imports: [PrismaModule, DepartmentsModule, EmployeesModule, QualificationsModule, AvailabilitiesModule, ShiftsModule, StaffingRequirementsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}