const GIB = 1024 ** 3;

/**
 * Planes de la iglesia. El plan no tiene columna: es la cuota de multimedia
 * (`churches.storage_quota_bytes`). La web tiene el mismo catalogo en
 * `src/domain/plans.ts`; si cambias un valor, cambialo en los dos.
 */
export const PLANS = {
  free: { name: 'Gratis', quotaBytes: 5 * GIB },
  plus: { name: 'Plus', quotaBytes: 15 * GIB },
  pro: { name: 'Pro', quotaBytes: 50 * GIB },
} as const;

export type PlanCode = keyof typeof PLANS;

export function isPlanCode(value: string): value is PlanCode {
  return value in PLANS;
}
