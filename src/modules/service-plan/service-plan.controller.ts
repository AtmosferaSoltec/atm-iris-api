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
  createServicePlanItemSchema,
  moveServicePlanItemSchema,
  type CreateServicePlanItemInput,
  type MoveServicePlanItemInput,
} from './dto/service-plan.schema.js';
import { ServicePlanService } from './service-plan.service.js';
import type { ServicePlanItem } from './service-plan.types.js';

@ApiTags('service-plan')
@ApiBearerAuth()
@Controller('service-plan')
export class ServicePlanController {
  constructor(private readonly servicePlan: ServicePlanService) {}

  @Get()
  @ApiOperation({ summary: 'Lo adelantado para el proximo servicio, en orden' })
  @ApiData('ServicePlanItem', { isArray: true })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ServicePlanItem[]> {
    return this.servicePlan.list(user.churchId);
  }

  @Post()
  @ApiOperation({
    summary: 'Agregar una cancion o un medio (201; 200 si el id ya existía)',
  })
  @ApiData('ServicePlanItem', { status: 201 })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServicePlanItemSchema))
    dto: CreateServicePlanItemInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ServicePlanItem> {
    const { item, isNew } = await this.servicePlan.add(user.churchId, dto);
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return item;
  }

  @Put(':id/position')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reordenar un elemento del plan' })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveServicePlanItemSchema))
    dto: MoveServicePlanItemInput,
  ): Promise<void> {
    return this.servicePlan.move(user.churchId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar un elemento del plan' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.servicePlan.remove(user.churchId, id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Vaciar todo el plan' })
  clear(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.servicePlan.clear(user.churchId);
  }
}
