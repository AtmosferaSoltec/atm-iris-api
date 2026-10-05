import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiData } from '../../common/swagger/api-schemas.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { syncChangesSchema, type SyncChangesQuery } from './dto/sync.schema.js';
import { SyncService } from './sync.service.js';
import type { SyncPage } from './sync.types.js';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('changes')
  // La primera sincronizacion pide muchas paginas seguidas; el limite general
  // por IP (300/min) cortaria una iglesia grande a la mitad.
  @SkipThrottle()
  @ApiOperation({
    summary: 'Cambios y borrados desde el cursor, para la copia local de las consolas',
  })
  @ApiData('SyncPage')
  changes(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(syncChangesSchema)) query: SyncChangesQuery,
  ): Promise<SyncPage> {
    return this.sync.changes(user.churchId, query);
  }
}
