import { describe, expect, it } from 'vitest';
import { firstValueFrom, of } from 'rxjs';

import { ResponseTransformInterceptor } from './response-transform.interceptor.js';

const context = {} as never;
const handlerOf = (value: unknown) => ({ handle: () => of(value) });

async function run(value: unknown) {
  const interceptor = new ResponseTransformInterceptor();
  return firstValueFrom(interceptor.intercept(context, handlerOf(value)));
}

describe('ResponseTransformInterceptor', () => {
  it('envuelve un objeto en data', async () => {
    await expect(run({ id: '1', name: 'Sublime gracia' })).resolves.toEqual({
      data: { id: '1', name: 'Sublime gracia' },
    });
  });

  it('envuelve una lista en data', async () => {
    await expect(run([1, 2, 3])).resolves.toEqual({ data: [1, 2, 3] });
  });

  it('deja intacta una respuesta ya paginada', async () => {
    const paginated = {
      data: [{ id: '1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };

    // Sin esto quedaria { data: { data, meta } } y el cliente tendria que
    // desempaquetar dos veces solo en los listados.
    await expect(run(paginated)).resolves.toBe(paginated);
  });

  it('convierte undefined y null en data nula', async () => {
    await expect(run(undefined)).resolves.toEqual({ data: null });
    await expect(run(null)).resolves.toEqual({ data: null });
  });
});
