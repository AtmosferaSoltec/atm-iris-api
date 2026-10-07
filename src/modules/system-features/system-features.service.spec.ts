import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../database/prisma.service.js';
import { toChurch } from '../church/church.mapper.js';
import { SystemFeaturesService } from './system-features.service.js';

function service(rows: { key: string; enabled: boolean }[]) {
  const prisma = {
    systemFeature: { findMany: vi.fn().mockResolvedValue(rows) },
  };
  return new SystemFeaturesService(prisma as unknown as PrismaService);
}

const churchRow = {
  id: 'c-1',
  name: 'Vida Nueva',
  timezone: 'America/Lima',
  bibleEnabled: true,
  multimediaEnabled: true,
  timeControlEnabled: false,
  storageQuotaBytes: 5368709120n,
  projectionFontFamily: 'system',
  projectionFontSizePt: 88,
  projectionDefaultBackground: null,
  syncVersion: 1n,
  createdAt: new Date('2026-10-07T00:00:00Z'),
  updatedAt: new Date('2026-10-07T00:00:00Z'),
};

describe('SystemFeaturesService', () => {
  it('un modulo sin fila esta disponible', async () => {
    expect(await service([]).availableModules()).toEqual({
      bible: true,
      multimedia: true,
      timeControl: true,
    });
  });

  it('una fila en false lo apaga para todo Iris', async () => {
    const features = service([{ key: 'bible', enabled: false }]);
    expect(await features.availableModules()).toEqual({
      bible: false,
      multimedia: true,
      timeControl: true,
    });
    await expect(features.assertAvailable('bible')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      features.assertAvailable('multimedia'),
    ).resolves.toBeUndefined();
  });

  it('el 404 explica que la Biblia no esta disponible', async () => {
    const error = await service([{ key: 'bible', enabled: false }])
      .assertAvailable('bible')
      .catch((e: NotFoundException) => e);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'NOT_FOUND',
      message: 'La Biblia no está disponible por ahora.',
    });
  });
});

describe('toChurch con interruptores del sistema', () => {
  it('lo apagado para todo Iris queda apagado aunque la iglesia lo tenga encendido', () => {
    const church = toChurch(churchRow as never, undefined, {
      bible: false,
      multimedia: true,
      timeControl: true,
    });
    expect(church.modules).toEqual({
      bible: false,
      multimedia: true,
      timeControl: false,
    });
    expect(church.availableModules).toEqual({
      bible: false,
      multimedia: true,
      timeControl: true,
    });
  });

  it('con todo disponible se respeta la eleccion de la iglesia', () => {
    const church = toChurch(churchRow as never);
    expect(church.modules).toEqual({
      bible: true,
      multimedia: true,
      timeControl: false,
    });
    expect(church.availableModules).toEqual({
      bible: true,
      multimedia: true,
      timeControl: true,
    });
  });
});
