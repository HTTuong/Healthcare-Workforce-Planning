import { Module } from '@nestjs/common';
import { AvailabilitiesController } from './availabilities.controller.js';
import { AvailabilitiesService } from './availabilities.service.js';
import { AvailabilityAccess } from './availability-access.service.js';

@Module({
  controllers: [AvailabilitiesController],
  providers: [AvailabilitiesService, AvailabilityAccess]
})
export class AvailabilitiesModule {}
