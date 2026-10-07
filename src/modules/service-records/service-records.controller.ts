import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { Paginated } from '../../common/dto/pagination.schema.js';
import { ApiData, ApiPaginated } from '../../common/swagger/api-schemas.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  listServiceRecordsSchema,
  recordIdSchema,
  serviceRecordInputSchema,
  updateBlockRecordSchema,
  type ListServiceRecordsQuery,
  type ServiceRecordInput,
  type UpdateBlockRecordInput,
} from './dto/service-records.schema.js';
import { ServiceRecordsService } from './service-records.service.js';
import type { ServiceRecord } from './service-records.types.js';

@ApiTags('service-records')
@ApiBearerAuth()
@Controller('service-records')
export class ServiceRecordsController {
  constructor(private readonly records: ServiceRecordsService) {}

  @Get()
  @ApiOperation({ summary: 'Registros de tiempos, el más reciente primero' })
  @ApiPaginated('ServiceRecord')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listServiceRecordsSchema)) query: ListServiceRecordsQuery,
  ): Promise<Paginated<ServiceRecord>> {
    return this.records.list(user.churchId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un registro de tiempos' })
  @ApiData('ServiceRecord')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ServiceRecord> {
    return this.records.get(user.churchId, id);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Guardar el registro de un servicio (201 si lo crea, 200 si ya existía; reemplazar uno distinto pide records.manage)',
  })
  @ApiData('ServiceRecord', { status: 201 })
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(recordIdSchema)) id: string,
    @Body(new ZodValidationPipe(serviceRecordInputSchema)) dto: ServiceRecordInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ServiceRecord> {
    const { record, isNew } = await this.records.save(user, id, dto);
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return record;
  }

  @Patch(':id/blocks/:blockId')
  @ApiOperation({ summary: 'Ajustar la duración real o el responsable de un bloque' })
  @ApiData('ServiceRecord')
  updateBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Body(new ZodValidationPipe(updateBlockRecordSchema)) dto: UpdateBlockRecordInput,
  ): Promise<ServiceRecord> {
    return this.records.updateBlock(user.churchId, id, blockId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar un registro de tiempos' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.records.remove(user.churchId, id);
  }
}
