import { Injectable } from '@nestjs/common';

import { notFound } from '../../common/exceptions/api-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { ChurchModules } from '../church/church.types.js';

export type ModuleName = keyof ChurchModules;

const MODULES: ModuleName[] = ['bible', 'multimedia', 'timeControl'];

const UNAVAILABLE: Record<ModuleName, string> = {
  bible: 'La Biblia no está disponible por ahora.',
  multimedia: 'Multimedia no está disponible por ahora.',
  timeControl: 'El control de tiempo no está disponible por ahora.',
};

/**
 * Interruptores de Iris entero (tabla `system_features`), por encima de los
 * modulos de cada iglesia. Se leen en cada peticion: es una tabla de pocas
 * filas y asi un cambio hecho a mano en la base se ve al instante.
 */
@Injectable()
export class SystemFeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Que modulos existen hoy en Iris. Un modulo sin fila esta disponible. */
  async availableModules(): Promise<ChurchModules> {
    const rows = await this.prisma.systemFeature.findMany({
      where: { key: { in: MODULES } },
      select: { key: true, enabled: true },
    });
    const enabled = new Map(rows.map((row) => [row.key, row.enabled]));
    return {
      bible: enabled.get('bible') ?? true,
      multimedia: enabled.get('multimedia') ?? true,
      timeControl: enabled.get('timeControl') ?? true,
    };
  }

  /** 404 mientras el modulo este apagado para todo el sistema. */
  async assertAvailable(module: ModuleName): Promise<void> {
    const available = await this.availableModules();
    if (!available[module]) throw notFound(UNAVAILABLE[module]);
  }
}
