import { Module } from '@nestjs/common';

import { SongsModule } from '../songs/songs.module.js';
import { YoutubeVideosModule } from '../youtube-videos/youtube-videos.module.js';
import { BackupController } from './backup.controller.js';
import { BackupService } from './backup.service.js';

@Module({
  imports: [SongsModule, YoutubeVideosModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
