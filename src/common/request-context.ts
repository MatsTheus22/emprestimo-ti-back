import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

// ADR-001 §3: contexto de request em AsyncLocalStorage, para tenant e
// usuário não virarem parâmetro em toda assinatura (e alguém esquecer).

export type AppRole = 'colaborador' | 'operacoes';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: AppRole;
}

interface RequestStore {
  auth?: AuthContext;
}

const storage = new AsyncLocalStorage<RequestStore>();

// Abre um store vazio por request; o AuthGuard o preenche.
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    storage.run({}, next);
  }
}

export const RequestContext = {
  setAuth(auth: AuthContext): void {
    const store = storage.getStore();
    if (!store) throw new Error('RequestContext fora de um request');
    store.auth = auth;
  },

  // Para código atrás do AuthGuard: sem auth aqui é bug, não acesso anônimo.
  auth(): AuthContext {
    const auth = storage.getStore()?.auth;
    if (!auth) throw new Error('RequestContext sem usuário autenticado');
    return auth;
  },
};
