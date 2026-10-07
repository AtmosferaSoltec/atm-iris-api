import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ApiData } from '../../common/swagger/api-schemas.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { SystemFeaturesService } from '../system-features/system-features.service.js';
import { BibleService } from './bible.service.js';
import type { BibleBook, BibleChapter, BibleTranslation } from './bible.types.js';
import { chapterParamsSchema, type ChapterParams } from './dto/bible.schema.js';

/**
 * Requiere sesion. No depende del modulo `bible` de cada iglesia, pero si del
 * interruptor de Iris entero (`system_features`): apagado, todo responde 404.
 */
@ApiTags('bible')
@ApiBearerAuth()
@Controller('bible/translations')
export class BibleController {
  constructor(
    private readonly bible: BibleService,
    private readonly features: SystemFeaturesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Traducciones disponibles' })
  @ApiData('BibleTranslation', { isArray: true })
  async list(): Promise<BibleTranslation[]> {
    await this.features.assertAvailable('bible');
    return this.bible.listTranslations();
  }

  @Get(':code/books')
  @ApiOperation({ summary: 'Libros en orden canónico' })
  @ApiData('BibleBook', { isArray: true })
  async books(@Param('code') code: string): Promise<BibleBook[]> {
    await this.features.assertAvailable('bible');
    return this.bible.listBooks(code);
  }

  @Get(':code/books/:bookId/chapters/:chapter')
  @ApiOperation({ summary: 'Versículos de un capítulo' })
  @ApiData('BibleChapter')
  async chapter(
    @Param(new ZodValidationPipe(chapterParamsSchema)) params: ChapterParams,
  ): Promise<BibleChapter> {
    await this.features.assertAvailable('bible');
    return this.bible.getChapter(params.code, params.bookId, params.chapter);
  }

  /**
   * La traduccion entera para buscar sin conexion. Va comprimida con gzip y por
   * fuera del interceptor `{ data }`: el cuerpo ya se armo con esa forma y se
   * cachea comprimido. Con `If-None-Match` igual al ETag responde 304.
   */
  @Get(':code/download')
  @ApiOperation({
    summary: 'Descarga completa (gzip, ETag por versión) para usar sin conexión',
  })
  @ApiData('BibleDownload')
  async download(
    @Param('code') code: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    await this.features.assertAvailable('bible');
    const { etag, body } = await this.bible.getDownload(code);

    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', 'private, no-cache');
    response.setHeader('Vary', 'Authorization');

    if (ifNoneMatch?.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)) {
      response.status(304).end();
      return;
    }

    response
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Content-Encoding', 'gzip')
      .setHeader('Content-Length', String(body.length))
      .end(body);
  }
}
