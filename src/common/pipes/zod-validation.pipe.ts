import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import { ZodError, type ZodType } from 'zod';

import { API_ERROR_CODES } from '../constants/error-codes.js';

/**
 * Valida el cuerpo, los parametros o la query contra un esquema de Zod.
 *
 * Escrito a mano y no con `nestjs-zod` a proposito: son treinta lineas, y evita
 * una dependencia mas que tendria que seguirle el paso a Zod 4 y a Nest 12.
 *
 * Se usa por endpoint:
 *
 *   @Post()
 *   create(@Body(new ZodValidationPipe(createSaleSchema)) dto: CreateSaleInput) {}
 */
@Injectable()
export class ZodValidationPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          code: API_ERROR_CODES.VALIDATION_FAILED,
          message: 'Revisa los datos enviados.',
          // Un error por campo, que es lo que el formulario necesita para
          // marcar el input correcto en lugar de mostrar un aviso general.
          errors: Object.fromEntries(
            error.issues.map((issue) => [
              issue.path.join('.') || '_',
              issue.message,
            ]),
          ),
        });
      }

      throw error;
    }
  }
}
