import { Module } from '@nestjs/common';

import { ChurchController } from './church.controller.js';
import { ChurchRepository } from './church.repository.js';
import { ChurchService } from './church.service.js';

@Module({
  controllers: [ChurchController],
  providers: [ChurchService, ChurchRepository],
  // La sincronizacion arma `church` del feed con el mismo servicio.
  exports: [ChurchService, ChurchRepository],
})
export class ChurchModule {}
