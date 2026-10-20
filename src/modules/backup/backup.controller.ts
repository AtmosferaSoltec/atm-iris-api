import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  BackupService,
  type BackupFile,
  type EraseResult,
  type ImportResult,
} from './backup.service.js';
import {
  eraseSchema,
  importBackupSchema,
  type EraseInput,
  type ImportBackupInput,
} from './dto/backup.schema.js';

@ApiTags('backup')
@ApiBearerAuth()
@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('export')
  @ApiOperation({
    summary: 'Respaldo: canciones (letra y enlaces) y videos de YouTube',
  })
  export(@CurrentUser() user: AuthenticatedUser): Promise<BackupFile> {
    return this.backup.export(user.churchId);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Importar un respaldo: crea lo que no hay, omite lo repetido',
  })
  import(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(importBackupSchema)) dto: ImportBackupInput,
  ): Promise<ImportResult> {
    return this.backup.import(user.churchId, dto);
  }

  @Post('erase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar en masa canciones, multimedia y/o videos de YouTube',
  })
  erase(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(eraseSchema)) dto: EraseInput,
  ): Promise<EraseResult> {
    return this.backup.erase(user.churchId, dto);
  }
}
