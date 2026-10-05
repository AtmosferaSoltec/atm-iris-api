import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Injectable, type NestMiddleware } from '@nestjs/common';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Lo que se acepta del cliente: corto y sin caracteres que ensucien el log. */
const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{1,100}$/;

type WithRequestId = IncomingMessage & { id?: unknown };

/**
 * Da a cada peticion un id para cruzar los logs del cliente con los del API.
 *
 * Respeta el que manda el cliente (la web reenvia el suyo) si es razonable; si
 * no, genera uno. Es idempotente: lo llaman el middleware y `genReqId` de pino,
 * y el que llegue segundo reutiliza el id del primero.
 */
export function resolveRequestId(
  request: WithRequestId,
  response: ServerResponse,
): string {
  if (typeof request.id === 'string') return request.id;

  const incoming = request.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();

  request.id = id;
  if (!response.headersSent) response.setHeader(REQUEST_ID_HEADER, id);

  return id;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: WithRequestId, response: ServerResponse, next: () => void) {
    resolveRequestId(request, response);
    next();
  }
}
