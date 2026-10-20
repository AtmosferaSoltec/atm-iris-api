import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiData } from '../../common/swagger/api-schemas.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  createYoutubeVideoSchema,
  type CreateYoutubeVideoInput,
} from './dto/youtube-videos.schema.js';
import { YoutubeVideosService } from './youtube-videos.service.js';
import type { YoutubeVideo } from './youtube-videos.types.js';

@ApiTags('youtube-videos')
@ApiBearerAuth()
@Controller('youtube-videos')
export class YoutubeVideosController {
  constructor(private readonly videos: YoutubeVideosService) {}

  @Get()
  @ApiOperation({
    summary: 'Videos de YouTube de la biblioteca, el más nuevo primero',
  })
  @ApiData('YoutubeVideo', { isArray: true })
  list(@CurrentUser() user: AuthenticatedUser): Promise<YoutubeVideo[]> {
    return this.videos.list(user.churchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un video de YouTube de la biblioteca' })
  @ApiData('YoutubeVideo')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<YoutubeVideo> {
    return this.videos.get(user.churchId, id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Guardar un video (201; 200 si el id o el video ya estaban en la iglesia)',
  })
  @ApiData('YoutubeVideo', { status: 201 })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createYoutubeVideoSchema))
    dto: CreateYoutubeVideoInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<YoutubeVideo> {
    const { video, isNew } = await this.videos.create(user.churchId, dto);
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return video;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Quitar un video de la biblioteca (y del plan del servicio)',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.videos.remove(user.churchId, id);
  }
}
