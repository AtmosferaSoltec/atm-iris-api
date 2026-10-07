import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiData } from '../../common/swagger/api-schemas.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  createServiceTypeSchema,
  serviceTypeInputSchema,
  type CreateServiceTypeInput,
  type ServiceTypeInput,
} from './dto/service-types.schema.js';
import { ServiceTypesService } from './service-types.service.js';
import type { ServiceType } from './service-types.types.js';

@ApiTags('service-types')
@ApiBearerAuth()
@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly serviceTypes: ServiceTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Tipos de servicio, por nombre' })
  @ApiData('ServiceType', { isArray: true })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ServiceType[]> {
    return this.serviceTypes.list(user.churchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un tipo de servicio con sus bloques' })
  @ApiData('ServiceType')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ServiceType> {
    return this.serviceTypes.get(user.churchId, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un tipo de servicio (201; 200 si el id ya existía)',
  })
  @ApiData('ServiceType', { status: 201 })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServiceTypeSchema))
    dto: CreateServiceTypeInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ServiceType> {
    const { serviceType, isNew } = await this.serviceTypes.create(
      user.churchId,
      dto,
    );
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return serviceType;
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Reemplazar un tipo de servicio y sus bloques (lo crea si no existe)',
  })
  @ApiData('ServiceType')
  async replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(serviceTypeInputSchema)) dto: ServiceTypeInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ServiceType> {
    const { serviceType, isNew } = await this.serviceTypes.replace(
      user.churchId,
      id,
      dto,
    );
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return serviceType;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar un tipo de servicio (conserva sus registros)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.serviceTypes.remove(user.churchId, id);
  }
}
