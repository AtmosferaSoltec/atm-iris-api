import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module.js';
import { ServicePlanRepository } from '../service-plan/service-plan.repository.js';
import { SongsController } from './songs.controller.js';
import { SongsRepository } from './songs.repository.js';
import { SongsService } from './songs.service.js';

@Module({
  imports: [MediaModule],
  controllers: [SongsController],
  // `ServicePlanRepository` solo depende de providers globales (Prisma, el
  // candado): declararla aqui, sin importar `ServicePlanModule`, evita un
  // ciclo (el plan ya depende de `SongsModule` para validar `refId`).
  providers: [SongsService, SongsRepository, ServicePlanRepository],
  exports: [SongsRepository],
})
export class SongsModule {}
