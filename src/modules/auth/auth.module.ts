import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { RefreshTokenService } from './services/refresh-token.service.js';
import { ResetCodeService } from './services/reset-code.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  // El secreto y la vida del token se pasan al firmar, no aqui: asi
  // `TokenService` es el unico que los conoce.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    TokenService,
    RefreshTokenService,
    ResetCodeService,
  ],
  // El guard global los necesita para validar cada peticion.
  exports: [TokenService, AuthRepository],
})
export class AuthModule {}
