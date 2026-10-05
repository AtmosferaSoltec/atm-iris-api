import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  API_ERROR_CODES,
  type ApiErrorCode,
} from '../constants/error-codes.js';
import type { ApiErrorBody } from '../dto/api-response.dto.js';

/** Codigo por defecto segun el estado, para las excepciones que no traen uno. */
const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: API_ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: API_ERROR_CODES.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: API_ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: API_ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: API_ERROR_CODES.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: API_ERROR_CODES.TOO_MANY_REQUESTS,
};

const FALLBACK_MESSAGE = 'Ocurrio un error inesperado. Intentalo de nuevo.';

type ExceptionPayload = {
  code?: string;
  message?: string | string[];
  errors?: Record<string, string>;
};

/**
 * Da forma unica a todo lo que sale con error.
 *
 * Nada de filtrar detalles internos: un fallo no controlado se registra completo
 * en el log y al cliente le llega un mensaje generico. El stack de una excepcion
 * de base de datos puede incluir la consulta y sus parametros.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload: ExceptionPayload = isHttp
      ? (() => {
          const raw = exception.getResponse();
          return typeof raw === 'string'
            ? { message: raw }
            : (raw as ExceptionPayload);
        })()
      : {};

    // `originalUrl` y no `url`: Express le quita el prefijo montado, asi que
    // `url` reportaria `/no-existe` en lugar de `/api/v1/no-existe` y el log
    // no serviria para encontrar el endpoint.
    const path = request.originalUrl ?? request.url;

    const body: ApiErrorBody = {
      statusCode: status,
      code:
        payload.code ??
        CODE_BY_STATUS[status] ??
        API_ERROR_CODES.INTERNAL_ERROR,
      message: normalizeMessage(payload.message, status, isHttp),
      ...(payload.errors ? { errors: payload.errors } : {}),
      timestamp: new Date().toISOString(),
      path,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${path} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }
}

function normalizeMessage(
  message: string | string[] | undefined,
  status: number,
  isHttp: boolean,
): string {
  // Un 500 nunca muestra su mensaje: puede traer detalles internos. Un 503 que
  // el propio codigo lanza a proposito (almacenamiento sin configurar) si.
  if (status === HttpStatus.INTERNAL_SERVER_ERROR || (!isHttp && status > 500)) {
    return FALLBACK_MESSAGE;
  }
  if (Array.isArray(message)) return message[0] ?? FALLBACK_MESSAGE;
  return message ?? FALLBACK_MESSAGE;
}
