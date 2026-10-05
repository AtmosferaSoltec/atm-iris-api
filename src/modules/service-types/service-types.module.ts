import { Module } from '@nestjs/common';

import { ServiceTypesController } from './service-types.controller.js';
import { ServiceTypesRepository } from './service-types.repository.js';
import { ServiceTypesService } from './service-types.service.js';

@Module({
  controllers: [ServiceTypesController],
  providers: [ServiceTypesService, ServiceTypesRepository],
  exports: [ServiceTypesRepository],
})
export class ServiceTypesModule {}
