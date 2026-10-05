import {
  Catch,
  ConflictException,
  NotFoundException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';

import { API_ERROR_CODES } from '../constants/error-codes.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

/** Codigos de error de Prisma que tienen una traduccion HTTP obvia. */
const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';
const FOREIGN_KEY_VIOLATION = 'P2003';

type PrismaKnownError = { code: string; meta?: { target?: string[] | string } };

function isPrismaKnownError(error: unknown): error is PrismaKnownError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('P')
  );
}

/**
 * Traduce los errores de Prisma antes de que lleguen al filtro general.
 *
 * Sin esto, violar un indice unico devuelve un 500 y el mensaje de Postgres con
 * el nombre del indice, que no le sirve a nadie del otro lado.
 */
@Catch()
export class PrismaExceptionFilter
  extends HttpExceptionFilter
  implements ExceptionFilter
{
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (!isPrismaKnownError(exception)) {
      return super.catch(exception, host);
    }

    switch (exception.code) {
      case UNIQUE_VIOLATION:
        return super.catch(
          new ConflictException({
            code: API_ERROR_CODES.CONFLICT,
            message: 'Ya existe un registro con esos datos.',
          }),
          host,
        );

      case RECORD_NOT_FOUND:
        return super.catch(
          new NotFoundException({
            code: API_ERROR_CODES.NOT_FOUND,
            message: 'No encontramos lo que buscabas.',
          }),
          host,
        );

      case FOREIGN_KEY_VIOLATION:
        return super.catch(
          new ConflictException({
            code: API_ERROR_CODES.CONFLICT,
            message: 'El registro esta en uso y no se puede modificar asi.',
          }),
          host,
        );

      default:
        return super.catch(exception, host);
    }
  }
}
