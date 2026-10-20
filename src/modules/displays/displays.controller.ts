import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  claimDisplaySchema,
  displayStateSchema,
  type ClaimDisplayInput,
  type DisplayStateInput,
} from './dto/displays.schema.js';
import { DisplaysService } from './displays.service.js';
import type {
  Display,
  DisplayPairing,
  PairingStatus,
} from './displays.types.js';

const BEARER = /^Bearer\s+(.+)$/i;

@ApiTags('displays')
@ApiBearerAuth()
@Controller('displays')
export class DisplaysController {
  constructor(private readonly displays: DisplaysService) {}

  @Public()
  @Post('pairings')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'El televisor pide un código para vincularse (público)',
  })
  startPairing(): DisplayPairing {
    return this.displays.startPairing();
  }

  @Public()
  @SkipThrottle()
  @Get('pairings/:id')
  @ApiOperation({
    summary: 'El televisor pregunta si ya lo vincularon (con su secreto)',
  })
  pairingStatus(
    @Param('id') id: string,
    @Headers('x-pairing-secret') secret: string | undefined,
  ): PairingStatus {
    return this.displays.pairingStatus(id, secret ?? '');
  }

  @Post()
  @ApiOperation({ summary: 'Vincular el televisor que muestra este código' })
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(claimDisplaySchema)) dto: ClaimDisplayInput,
  ): Promise<Display> {
    return this.displays.claim(user.churchId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Televisores de la iglesia y si están conectados' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Display[]> {
    return this.displays.list(user.churchId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desvincular un televisor' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.displays.remove(user.churchId, id);
  }

  @SkipThrottle()
  @Put('state')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Lo que muestran los televisores (desde la consola)',
  })
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(displayStateSchema)) dto: DisplayStateInput,
  ): void {
    this.displays.publish(user.churchId, dto);
  }

  @Public()
  @SkipThrottle()
  @Get('stream')
  @ApiOperation({
    summary: 'Canal en vivo del televisor (SSE, con el token del televisor)',
  })
  async stream(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    await this.displays.open(token, response);
  }
}
