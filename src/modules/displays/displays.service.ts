import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import {
  notFound,
  validationFailed,
} from '../../common/exceptions/api-errors.js';
import type { Display as DisplayRow } from '../../generated/prisma/client.js';
import type {
  ClaimDisplayInput,
  DisplayStateInput,
} from './dto/displays.schema.js';
import { DisplaysHub } from './displays.hub.js';
import { DisplaysRepository } from './displays.repository.js';
import type {
  Display,
  DisplayPairing,
  PairingStatus,
} from './displays.types.js';

/** Sin letras que se confunden en un televisor (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Un televisor que ya recibio su token no lo vuelve a pedir: la vinculacion se borra. */
const MAX_PENDING_PAIRINGS = 2000;

type Pending = {
  id: string;
  code: string;
  secret: string;
  expiresAt: number;
  /** Lo que el televisor recoge al preguntar, una vez vinculado. */
  result?: { token: string; display: { id: string; name: string } };
};

@Injectable()
export class DisplaysService {
  /** Vinculaciones pendientes, por id y por codigo. En memoria: duran 10 minutos. */
  private readonly pairings = new Map<string, Pending>();
  private readonly byCode = new Map<string, Pending>();

  constructor(
    private readonly repository: DisplaysRepository,
    private readonly hub: DisplaysHub,
  ) {}

  /** El televisor pide un codigo para mostrarlo en pantalla. */
  startPairing(): DisplayPairing {
    this.sweep();
    if (this.pairings.size >= MAX_PENDING_PAIRINGS) {
      throw validationFailed({ code: 'Intenta de nuevo en unos minutos.' });
    }
    let code: string;
    do {
      code = Array.from(
        { length: 6 },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
      ).join('');
    } while (this.byCode.has(code));
    const pending: Pending = {
      id: randomBytes(16).toString('hex'),
      code,
      secret: randomBytes(24).toString('base64url'),
      expiresAt: Date.now() + PAIRING_TTL_MS,
    };
    this.pairings.set(pending.id, pending);
    this.byCode.set(code, pending);
    return {
      id: pending.id,
      code,
      secret: pending.secret,
      expiresAt: new Date(pending.expiresAt).toISOString(),
    };
  }

  /** El televisor pregunta si ya lo vincularon; la respuesta con el token sale una sola vez. */
  pairingStatus(id: string, secret: string): PairingStatus {
    const pending = this.pairings.get(id);
    if (
      !pending ||
      pending.expiresAt < Date.now() ||
      !sameSecret(pending.secret, secret)
    ) {
      throw notFound('Ese código ya venció. Pide uno nuevo.');
    }
    if (!pending.result) return { status: 'pending' };
    this.forget(pending);
    return { status: 'paired', ...pending.result };
  }

  /** Desde la consola: el codigo que muestra el televisor lo vincula a la iglesia. */
  async claim(churchId: string, input: ClaimDisplayInput): Promise<Display> {
    const pending = this.byCode.get(input.code);
    if (!pending || pending.expiresAt < Date.now() || pending.result) {
      throw validationFailed({ code: 'Ese código no existe o ya venció.' });
    }
    const token = `dsp_${randomBytes(32).toString('base64url')}`;
    const row = await this.repository.create(churchId, input.name, hash(token));
    pending.result = { token, display: { id: row.id, name: row.name } };
    // Ya no se puede volver a usar, aunque el televisor tarde en recogerlo.
    this.byCode.delete(pending.code);
    return this.toDisplay(row);
  }

  async list(churchId: string): Promise<Display[]> {
    const rows = await this.repository.list(churchId);
    return rows.map((row) => this.toDisplay(row));
  }

  async remove(churchId: string, id: string): Promise<void> {
    const { count } = await this.repository.delete(churchId, id);
    if (count === 0) throw notFound('Ese televisor no existe.');
    this.hub.close(churchId, id);
  }

  publish(churchId: string, state: DisplayStateInput): void {
    const { displayId, ...content } = state;
    this.hub.publish(churchId, content, displayId);
  }

  /** El canal del televisor, con su token. */
  async open(token: string | undefined, response: Response): Promise<void> {
    const row = token
      ? await this.repository.findByTokenHash(hash(token))
      : null;
    if (!row) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.UNAUTHORIZED,
        message: 'Este televisor ya no está vinculado.',
      });
    }
    await this.repository.touch(row.id);
    this.hub.open(
      row.churchId,
      row.id,
      response,
      () => void this.repository.touch(row.id),
    );
  }

  private toDisplay(row: DisplayRow): Display {
    return {
      id: row.id,
      name: row.name,
      online: this.hub.isOnline(row.churchId, row.id),
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private forget(pending: Pending): void {
    this.pairings.delete(pending.id);
    if (this.byCode.get(pending.code) === pending)
      this.byCode.delete(pending.code);
  }

  private sweep(): void {
    const now = Date.now();
    for (const pending of this.pairings.values()) {
      if (pending.expiresAt < now) this.forget(pending);
    }
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
