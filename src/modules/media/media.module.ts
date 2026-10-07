import { Module } from '@nestjs/common';

import { ServicePlanRepository } from '../service-plan/service-plan.repository.js';
import { MediaCleanupService } from './media-cleanup.service.js';
import { MediaController } from './media.controller.js';
import { MediaRepository } from './media.repository.js';
import { MediaService } from './media.service.js';

@Module({
  controllers: [MediaController],
  // `ServicePlanRepository` solo depende de providers globales (Prisma, el
  // candado): declararla aqui, sin importar `ServicePlanModule`, evita un
  // ciclo (el plan ya depende de `MediaModule` para validar `refId`).
  providers: [
    MediaService,
    MediaRepository,
    MediaCleanupService,
    ServicePlanRepository,
  ],
  exports: [MediaRepository],
})
export class MediaModule {}
