import { createLocalJWKSet, exportJWK, generateKeyPair, JWTPayload, KeyLike, SignJWT } from 'jose';
import { JWT_KEY_SET, JwtKeySet } from '../../src/modules/auth/jwt-verifier';

// Emissor de tokens de teste com o mesmo formato do Supabase Auth (ES256,
// aud "authenticated", issuer do env). A app recebe a chave pública via
// override de JWT_KEY_SET, no lugar do JWKS remoto.
export interface TestTokens {
  keySetOverride: { provide: symbol; useValue: JwtKeySet };
  sign(claims: JWTPayload, options?: { expiresIn?: string; issuer?: string }): Promise<string>;
  // Mesmo formato, assinado por outra chave: a API precisa recusar.
  signWithForeignKey(claims: JWTPayload): Promise<string>;
}

function signer(privateKey: KeyLike) {
  return (claims: JWTPayload, options: { expiresIn?: string; issuer?: string } = {}) =>
    new SignJWT({ role: 'authenticated', ...claims })
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setIssuer(options.issuer ?? process.env.SUPABASE_JWT_ISSUER ?? '')
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '1h')
      .sign(privateKey);
}

export async function createTestTokens(): Promise<TestTokens> {
  const trusted = await generateKeyPair('ES256');
  const foreign = await generateKeyPair('ES256');
  const publicJwk = { ...(await exportJWK(trusted.publicKey)), kid: 'test', alg: 'ES256' };

  const signTrusted = signer(trusted.privateKey);
  const signForeign = signer(foreign.privateKey);

  return {
    keySetOverride: { provide: JWT_KEY_SET, useValue: createLocalJWKSet({ keys: [publicJwk] }) },
    sign: signTrusted,
    signWithForeignKey: (claims) => signForeign(claims),
  };
}
