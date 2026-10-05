import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import {
  RequestIdMiddleware,
  resolveRequestId,
} from './common/middleware/request-id.middleware.js';
import { validateEnv } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { MailModule } from './integrations/mail/mail.module.js';
import { StorageModule } from './integrations/storage/storage.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BibleModule } from './modules/bible/bible.module.js';
import { ChurchModule } from './modules/church/church.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { MembersModule } from './modules/members/members.module.js';
import { PeopleModule } from './modules/people/people.module.js';
import { ServiceRecordsModule } from './modules/service-records/service-records.module.js';
import { ServiceTypesModule } from './modules/service-types/service-types.module.js';
import { SongsModule } from './modules/songs/songs.module.js';
import { SyncModule } from './modules/sync/sync.module.js';

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
        // El mismo id que viaja en X-Request-Id: cruza el log con el cliente.
        genReqId: resolveRequestId,
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

    // Tareas programadas (limpieza horaria de multimedia).
    ScheduleModule.forRoot(),

    DatabaseModule,
    MailModule,
    StorageModule,
    AuthModule,
    MembersModule,
    ChurchModule,
    PeopleModule,
    ServiceTypesModule,
    SongsModule,
    MediaModule,
    BibleModule,
    ServiceRecordsModule,
    SyncModule,
    HealthModule,
  ],
  providers: [
    // El orden importa: primero el limite de peticiones, luego la sesion y al
    // final los permisos, que leen el rol que deja la sesion.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*splat}');
  }
}
