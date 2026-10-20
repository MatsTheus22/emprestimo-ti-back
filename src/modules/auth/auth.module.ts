import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { JwtVerifier, jwtKeySetProvider } from './jwt-verifier';

// Guard global: toda rota exige token, exceto as marcadas com @Public().
@Module({
  providers: [jwtKeySetProvider, JwtVerifier, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
