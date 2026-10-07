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
  createSongSchema,
  listSongsSchema,
  songInputSchema,
  type CreateSongInput,
  type ListSongsQuery,
  type SongInput,
} from './dto/songs.schema.js';
import { SongsService } from './songs.service.js';
import type { Song, SongSummary } from './songs.types.js';

@ApiTags('songs')
@ApiBearerAuth()
@Controller('songs')
export class SongsController {
  constructor(private readonly songs: SongsService) {}

  @Get()
  @ApiOperation({
    summary: 'Biblioteca de canciones, paginada (búsqueda sin acentos)',
  })
  @ApiPaginated('SongSummary')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listSongsSchema)) query: ListSongsQuery,
  ): Promise<Paginated<SongSummary>> {
    return this.songs.list(user.churchId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una canción con todas sus secciones' })
  @ApiData('Song')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Song> {
    return this.songs.get(user.churchId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una canción (201; 200 si el id ya existía)' })
  @ApiData('Song', { status: 201 })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSongSchema)) dto: CreateSongInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Song> {
    const { song, isNew } = await this.songs.create(user.churchId, dto);
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return song;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Reemplazar una canción (la crea si no existe)' })
  @ApiData('Song')
  async replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(songInputSchema)) dto: SongInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Song> {
    const { song, isNew } = await this.songs.replace(user.churchId, id, dto);
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return song;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar una canción' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.songs.remove(user.churchId, id);
  }
}
