import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class DisplaysRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(churchId: string) {
    return this.prisma.display.findMany({
      where: { churchId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(churchId: string, name: string, tokenHash: string) {
    return this.prisma.display.create({ data: { churchId, name, tokenHash } });
  }

  findByTokenHash(tokenHash: string) {
    return this.prisma.display.findUnique({ where: { tokenHash } });
  }

  touch(id: string) {
    return this.prisma.display.updateMany({
      where: { id },
      data: { lastSeenAt: new Date() },
    });
  }

  /** `count` 0 si no era de la iglesia. */
  delete(churchId: string, id: string) {
    return this.prisma.display.deleteMany({ where: { id, churchId } });
  }
}
