import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';
import type { Env } from '../../config/env';
import { ENV } from '../../config/env.module';

// ADR-001 §7: a API valida a assinatura do JWT do Supabase contra a chave
// pública (JWKS), sem consultar o Auth a cada request.
export const JWT_KEY_SET = Symbol('JWT_KEY_SET');
export type JwtKeySet = Parameters<typeof jwtVerify>[1];

export const jwtKeySetProvider = {
  provide: JWT_KEY_SET,
  inject: [ENV],
  // createRemoteJWKSet guarda as chaves em cache e só rebusca quando
  // aparece um `kid` novo (rotação).
  useFactory: (env: Env): JwtKeySet => createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL)),
};

@Injectable()
export class JwtVerifier {
  constructor(
    @Inject(JWT_KEY_SET) private readonly keySet: JwtKeySet,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // Lança se a assinatura, o emissor, a audiência ou a validade falharem.
  async verify(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.keySet, {
      issuer: this.env.SUPABASE_JWT_ISSUER,
      audience: 'authenticated',
    });
    return payload;
  }
}
