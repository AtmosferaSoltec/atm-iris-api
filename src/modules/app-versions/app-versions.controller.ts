import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiData } from '../../common/swagger/api-schemas.js';
import { AppVersionsService } from './app-versions.service.js';
import type { AppVersionCheck } from './app-versions.types.js';
import {
  appVersionQuerySchema,
  type AppVersionQuery,
} from './dto/app-versions.schema.js';

@ApiTags('app-version')
@Controller('app-version')
export class AppVersionsController {
  constructor(private readonly versions: AppVersionsService) {}

  /** Publico: las apps lo consultan al abrir, antes de iniciar sesion. */
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Si esta version de la app debe actualizarse para continuar',
  })
  @ApiData('AppVersionCheck')
  check(
    @Query(new ZodValidationPipe(appVersionQuerySchema)) query: AppVersionQuery,
  ): Promise<AppVersionCheck> {
    return this.versions.check(query.platform, query.version);
  }
}
