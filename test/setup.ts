import 'dotenv/config';

/**
 * Los e2e hacen muchos logins seguidos y los limites reales los agotan. Se
 * suben aqui para que las pruebas funcionales midan lo que quieren medir; el
 * limite de login se verifica en `throttle.e2e-spec.ts`, aislado con sus propios
 * valores.
 */
process.env.THROTTLE_LIMIT = '1000';
process.env.LOGIN_THROTTLE_LIMIT = '1000';
process.env.SIGN_UP_THROTTLE_LIMIT = '1000';
process.env.FORGOT_THROTTLE_LIMIT = '1000';
process.env.RESET_CODE_THROTTLE_LIMIT = '1000';
