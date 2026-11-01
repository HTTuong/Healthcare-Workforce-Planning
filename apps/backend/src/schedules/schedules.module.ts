import { Module } from '@nestjs/common';
import { ScheduleInputLoader } from './schedule-input.loader.js';
import { SchedulesController } from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';

@Module({
  controllers: [SchedulesController],
  providers: [SchedulesService, ScheduleInputLoader]
})
export class SchedulesModule {}
