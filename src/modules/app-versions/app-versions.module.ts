import { Module } from '@nestjs/common';

import { AppVersionsController } from './app-versions.controller.js';
import { AppVersionsService } from './app-versions.service.js';

@Module({
  controllers: [AppVersionsController],
  providers: [AppVersionsService],
})
export class AppVersionsModule {}
