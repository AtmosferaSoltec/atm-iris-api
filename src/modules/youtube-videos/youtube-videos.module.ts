import { Module } from '@nestjs/common';

import { ServicePlanRepository } from '../service-plan/service-plan.repository.js';
import { YoutubeVideosController } from './youtube-videos.controller.js';
import { YoutubeVideosRepository } from './youtube-videos.repository.js';
import { YoutubeVideosService } from './youtube-videos.service.js';

@Module({
  controllers: [YoutubeVideosController],
  // `ServicePlanRepository` solo depende de providers globales: se declara aqui, sin
  // importar `ServicePlanModule`, para evitar un ciclo (el plan valida con este repositorio).
  providers: [
    YoutubeVideosService,
    YoutubeVideosRepository,
    ServicePlanRepository,
  ],
  exports: [YoutubeVideosRepository, YoutubeVideosService],
})
export class YoutubeVideosModule {}
