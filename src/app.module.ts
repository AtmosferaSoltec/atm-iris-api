import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { validateEnv } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { MailModule } from './integrations/mail/mail.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';

const LOG_LEVEL: Record<string, string> = {
  production: 'info',
  test: 'silent',
  development: 'debug',
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Valida el entorno al arrancar. Si algo falta, el proceso no levanta.
      validate: validateEnv,
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        // JSON en produccion para cualquier agregador; legible en desarrollo.
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'HH:MM:ss' },
              },
        // En las pruebas no hay nadie leyendo: solo taparia el resultado.
        level: LOG_LEVEL[process.env.NODE_ENV ?? 'development'] ?? 'debug',
        // El health check dispara cada pocos segundos: sin esto el log queda
        // inservible.
        autoLogging: { ignore: (req) => req.url?.includes('/health') ?? false },
        // Nada de credenciales en el log: ni tokens ni contrasenas ni codigos.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.passwordConfirmation',
            'req.body.code',
            'req.body.refreshToken',
          ],
          censor: '[oculto]',
        },
      },
    }),

    // Freno general, holgado. Los endpoints sensibles llevan su propio
    // `@Throttle`, mas estrecho.
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
          limit: Number(process.env.THROTTLE_LIMIT ?? 300),
        },
      ],
    }),

    DatabaseModule,
    MailModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    // El orden importa: primero el limite de peticiones, luego la sesion.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
