import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DepartmentsModule } from './departments/departments.module.js';

@Module({
  imports: [DepartmentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
