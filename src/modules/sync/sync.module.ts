import { Module } from '@nestjs/common';

import { ChurchModule } from '../church/church.module.js';
import { MediaModule } from '../media/media.module.js';
import { PeopleModule } from '../people/people.module.js';
import { ServiceRecordsModule } from '../service-records/service-records.module.js';
import { ServiceTypesModule } from '../service-types/service-types.module.js';
import { SongsModule } from '../songs/songs.module.js';
import { SyncController } from './sync.controller.js';
import { SyncRepository } from './sync.repository.js';
import { SyncService } from './sync.service.js';

/** Reutiliza los repositorios y mappers de cada modulo: una sola forma de cada recurso. */
@Module({
  imports: [
    ChurchModule,
    PeopleModule,
    ServiceTypesModule,
    SongsModule,
    MediaModule,
    ServiceRecordsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncRepository],
})
export class SyncModule {}
