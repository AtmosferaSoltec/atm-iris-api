import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { API_ERROR_CODES } from '../constants/error-codes.js';

/**
 * Errores que repiten varios modulos, con el `code` y el mensaje del contrato
 * en un solo lugar.
 */

/** 404 tambien para lo de otra iglesia: un 403 confirmaria que existe. */
export const notFound = (message = 'No encontramos lo que buscabas.') =>
  new NotFoundException({ code: API_ERROR_CODES.NOT_FOUND, message });

/** El id que mando el cliente ya es de un recurso de otra iglesia. */
export const idConflict = (field = 'id') =>
  new ConflictException({
    code: API_ERROR_CODES.ID_CONFLICT,
    message: 'Ese identificador ya está en uso. Genera uno nuevo e inténtalo otra vez.',
    errors: { [field]: 'Ese identificador ya está en uso.' },
  });

/** Errores por campo que solo se pueden comprobar contra la base. */
export const validationFailed = (errors: Record<string, string>) =>
  new BadRequestException({
    code: API_ERROR_CODES.VALIDATION_FAILED,
    message: 'Revisa los datos enviados.',
    errors,
  });
