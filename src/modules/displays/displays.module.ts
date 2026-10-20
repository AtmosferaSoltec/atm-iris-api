import { Module } from '@nestjs/common';

import { DisplaysController } from './displays.controller.js';
import { DisplaysHub } from './displays.hub.js';
import { DisplaysRepository } from './displays.repository.js';
import { DisplaysService } from './displays.service.js';

@Module({
  controllers: [DisplaysController],
  providers: [DisplaysService, DisplaysRepository, DisplaysHub],
})
export class DisplaysModule {}
