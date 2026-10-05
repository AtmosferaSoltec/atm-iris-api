import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

/**
 * Envuelve toda respuesta exitosa en `{ data }`, salvo las que ya vienen
 * paginadas con su `meta`.
 *
 * Asi el cliente siempre desempaqueta igual y agregar metadatos manana (un
 * total, un aviso) no rompe a nadie.
 */
@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((payload: unknown) => {
        if (payload === undefined || payload === null) return { data: null };

        // Ya viene con la forma paginada: se deja tal cual.
        if (
          typeof payload === 'object' &&
          'data' in payload &&
          'meta' in payload
        ) {
          return payload;
        }

        return { data: payload };
      }),
    );
  }
}
