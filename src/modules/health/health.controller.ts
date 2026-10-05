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
import { StoragePort } from '../../integrations/storage/storage.port.js';

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
    private readonly storage: StoragePort,
  ) {}

  /**
   * Lo consume el HEALTHCHECK de Docker. Verifica la base de datos y el
   * almacenamiento: un proceso
   * que responde pero no puede consultar no esta sano, y reiniciarlo a ciegas
   * tampoco ayuda si el problema es la base.
   */
  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Estado del servicio, la base de datos y el almacenamiento',
  })
  async check(): Promise<Pick<HealthCheckResult, 'status' | 'info'>> {
    // El contrato solo expone `status` e `info`; `error` y `details` de
    // Terminus repiten lo mismo.
    const { status, info } = await this.health.check([
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
      // Sin almacenamiento configurado (solo en desarrollo) no se informa: la
      // API sirve igual todo lo que no sea multimedia y no debe marcarse caida.
      ...(this.storage.isConfigured
        ? [
            async () => {
              try {
                await this.storage.ping();
                return { storage: { status: 'up' as const } };
              } catch (error) {
                return {
                  storage: {
                    status: 'down' as const,
                    message:
                      error instanceof Error ? error.message : 'Sin conexion',
                  },
                };
              }
            },
          ]
        : []),
    ]);

    return { status, info };
  }
}
