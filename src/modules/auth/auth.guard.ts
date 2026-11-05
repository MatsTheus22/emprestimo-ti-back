import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { z } from 'zod';
import { RequestContext } from '../../common/request-context';
import { JwtVerifier } from './jwt-verifier';
import { IS_PUBLIC } from './public.decorator';

// Claims que o custom_access_token_hook põe no token (spec 002 CA-01).
// ADR-001 §6: o tenant vem SÓ daqui — nunca de body, query ou header.
const tenantClaims = z.object({
  sub: z.uuid(),
  tenant_id: z.uuid(),
  app_role: z.enum(['colaborador', 'operacoes']),
});

export const NO_ACCESS_MESSAGE = 'Seu usuário não tem acesso. Fale com Operações.';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const token = bearerToken(context.switchToHttp().getRequest<Request>());
    if (!token) throw new UnauthorizedException('Token ausente');

    const payload = await this.verifier.verify(token).catch(() => {
      throw new UnauthorizedException('Token inválido ou expirado');
    });

    // Token válido, mas sem membership: autenticado e sem acesso (CA-04).
    const claims = tenantClaims.safeParse(payload);
    if (!claims.success) throw new ForbiddenException(NO_ACCESS_MESSAGE);

    RequestContext.setAuth({
      userId: claims.data.sub,
      tenantId: claims.data.tenant_id,
      role: claims.data.app_role,
    });
    return true;
  }
}

function bearerToken(req: Request): string | null {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
