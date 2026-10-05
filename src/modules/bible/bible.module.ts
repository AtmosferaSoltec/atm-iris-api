import { Module } from '@nestjs/common';

import { BibleController } from './bible.controller.js';
import { BibleRepository } from './bible.repository.js';
import { BibleService } from './bible.service.js';

@Module({
  controllers: [BibleController],
  providers: [BibleService, BibleRepository],
})
export class BibleModule {}
