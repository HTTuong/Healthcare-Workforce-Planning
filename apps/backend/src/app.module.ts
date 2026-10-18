import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DepartmentsModule } from './departments/departments.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QualificationsModule } from './qualifications/qualifications.module.js';

@Module({
  imports: [PrismaModule, DepartmentsModule, EmployeesModule, QualificationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}