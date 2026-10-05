import { Module } from '@nestjs/common';

import { MediaCleanupService } from './media-cleanup.service.js';
import { MediaController } from './media.controller.js';
import { MediaRepository } from './media.repository.js';
import { MediaService } from './media.service.js';

@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaRepository, MediaCleanupService],
  exports: [MediaRepository],
})
export class MediaModule {}
