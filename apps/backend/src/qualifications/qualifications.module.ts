import { Module } from '@nestjs/common';
import { QualificationsController } from './qualifications.controller.js';
import { QualificationsService } from './qualifications.service.js';

@Module({
  controllers: [QualificationsController],
  providers: [QualificationsService]
})
export class QualificationsModule {}