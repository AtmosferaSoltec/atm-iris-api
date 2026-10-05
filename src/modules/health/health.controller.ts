import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator.js';
import {
  HealthCheck,
  HealthCheckService,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { PrismaService } from '../../database/prisma.service.js';

@ApiTags('health')
// Docker consulta este endpoint cada diez segundos. Sometido al limite general
// (300 por minuto por IP), Docker solo agotaria la cuota, el health check empezaria
// a devolver 429 y el contenedor se reiniciaria estando sano.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Lo consume el HEALTHCHECK de Docker. Verifica la base de datos: un proceso
   * que responde pero no puede consultar no esta sano, y reiniciarlo a ciegas
   * tampoco ayuda si el problema es la base.
   */
  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Estado del servicio y de la base de datos' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => {
        try {
          await this.prisma.ping();
          return { database: { status: 'up' } };
        } catch (error) {
          return {
            database: {
              status: 'down',
              message: error instanceof Error ? error.message : 'Sin conexion',
            },
          };
        }
      },
    ]);
  }
}
