import { Module } from '@nestjs/common';
import { AvailabilitiesController } from './availabilities.controller.js';
import { AvailabilitiesService } from './availabilities.service.js';

@Module({
  controllers: [AvailabilitiesController],
  providers: [AvailabilitiesService]
})
export class AvailabilitiesModule {}