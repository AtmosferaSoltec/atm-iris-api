import { z } from 'zod';

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = { data: T[]; meta: PaginationMeta };

/**
 * `page` y `limit` de la query. El tope por defecto es 100; tiempos y
 * sincronizacion piden mas (`createPaginationSchema({ maxLimit: 500 })`)
 * porque los resumenes de la consola se calculan sobre muchos registros.
 */
export function createPaginationSchema({ maxLimit = 100, defaultLimit = 20 } = {}) {
  return z.object({
    page: z.coerce
      .number('La página debe ser un número.')
      .int('La página debe ser un número entero.')
      .min(1, 'La página empieza en 1.')
      .default(1),
    limit: z.coerce
      .number('El límite debe ser un número.')
      .int('El límite debe ser un número entero.')
      .min(1, 'El límite mínimo es 1.')
      .max(maxLimit, `El límite máximo es ${maxLimit}.`)
      .default(defaultLimit),
  });
}

export const paginationSchema = createPaginationSchema();

export type PaginationInput = z.infer<typeof paginationSchema>;

/** Forma paginada del contrato; el interceptor la deja pasar sin envolverla. */
export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** `skip`/`take` de Prisma para una pagina. */
export const pageWindow = ({ page, limit }: PaginationInput) => ({
  skip: (page - 1) * limit,
  take: limit,
});
