import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module.js';
import { SongsModule } from '../songs/songs.module.js';
import { ServicePlanController } from './service-plan.controller.js';
import { ServicePlanRepository } from './service-plan.repository.js';
import { ServicePlanService } from './service-plan.service.js';

@Module({
  imports: [SongsModule, MediaModule],
  controllers: [ServicePlanController],
  providers: [ServicePlanService, ServicePlanRepository],
  exports: [ServicePlanRepository],
})
export class ServicePlanModule {}
