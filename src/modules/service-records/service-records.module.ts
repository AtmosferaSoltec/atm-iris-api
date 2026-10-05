import { Module } from '@nestjs/common';

import { ServiceRecordsController } from './service-records.controller.js';
import { ServiceRecordsRepository } from './service-records.repository.js';
import { ServiceRecordsService } from './service-records.service.js';

@Module({
  controllers: [ServiceRecordsController],
  providers: [ServiceRecordsService, ServiceRecordsRepository],
  exports: [ServiceRecordsRepository],
})
export class ServiceRecordsModule {}
