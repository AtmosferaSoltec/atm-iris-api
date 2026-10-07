import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiData } from '../../common/swagger/api-schemas.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ChurchService } from './church.service.js';
import type { Church } from './church.types.js';
import {
  churchModulesSchema,
  updateChurchSchema,
  type ChurchModulesInput,
  type UpdateChurchInput,
} from './dto/church.schema.js';

@ApiTags('church')
@ApiBearerAuth()
@Controller('church')
export class ChurchController {
  constructor(private readonly church: ChurchService) {}

  @Get()
  @ApiOperation({ summary: 'Iglesia actual: ajustes, módulos y almacenamiento' })
  @ApiData('Church')
  get(@CurrentUser() user: AuthenticatedUser): Promise<Church> {
    return this.church.get(user.churchId);
  }

  @Patch()
  @ApiOperation({ summary: 'Cambiar el nombre o la zona horaria' })
  @ApiData('Church')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateChurchSchema)) dto: UpdateChurchInput,
  ): Promise<Church> {
    return this.church.update(user.churchId, dto);
  }

  @Put('modules')
  @ApiOperation({ summary: 'Encender o apagar Biblia, Multimedia y Control de tiempo' })
  @ApiData('Church')
  setModules(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(churchModulesSchema)) dto: ChurchModulesInput,
  ): Promise<Church> {
    return this.church.setModules(user.churchId, dto);
  }
}
