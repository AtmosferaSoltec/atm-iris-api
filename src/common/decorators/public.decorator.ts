import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como abierto. El guard de sesion es global, asi que lo
 * seguro es el default: si alguien olvida decorar un endpoint nuevo, queda
 * protegido en lugar de quedar expuesto.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
