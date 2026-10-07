import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
  confirmUploadSchema,
  createUploadSchema,
  listMediaSchema,
  updateMediaSchema,
  type ConfirmUploadInput,
  type CreateUploadInput,
  type ListMediaQuery,
  type UpdateMediaInput,
} from './dto/media.schema.js';
import { MediaService } from './media.service.js';
import type { DownloadUrl, MediaAsset, UploadTicket } from './media.types.js';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @ApiOperation({
    summary: 'Pedir una URL firmada para subir un archivo (valida tipo, tamaño y cuota)',
  })
  @ApiData('UploadTicket', { status: 201 })
  createUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createUploadSchema)) dto: CreateUploadInput,
  ): Promise<UploadTicket> {
    return this.media.createUpload(user, dto);
  }

  @Post()
  @ApiOperation({ summary: 'Confirmar una subida y crear el archivo' })
  @ApiData('MediaAsset', { status: 201 })
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmUploadSchema)) dto: ConfirmUploadInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MediaAsset> {
    const { asset, isNew } = await this.media.confirmUpload(user, dto);
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return asset;
  }

  @Get()
  @ApiOperation({ summary: 'Multimedia de la iglesia, la más reciente primero' })
  @ApiPaginated('MediaAsset')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listMediaSchema)) query: ListMediaQuery,
  ): Promise<Paginated<MediaAsset>> {
    return this.media.list(user.churchId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un archivo' })
  @ApiData('MediaAsset')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MediaAsset> {
    return this.media.get(user.churchId, id);
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'URL firmada de descarga (1 h)' })
  @ApiData('DownloadUrl')
  downloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DownloadUrl> {
    return this.media.downloadUrl(user.churchId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cambiar título, descripción o si es fondo' })
  @ApiData('MediaAsset')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMediaSchema)) dto: UpdateMediaInput,
  ): Promise<MediaAsset> {
    return this.media.update(user.churchId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar un archivo (libera la cuota)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.media.remove(user.churchId, id);
  }
}
