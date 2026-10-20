import type { INestApplication } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';

type HttpHandler = (req: IncomingMessage, res: ServerResponse) => void;

// ADR-001 §3: na Vercel o Nest não roda como processo. A instância fica
// guardada fora do handler, então só a primeira invocação de cada
// instância da function paga o bootstrap do container de DI.
export function createServerlessHandler(
  createApp: () => Promise<INestApplication>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  let cached: Promise<HttpHandler> | undefined;

  const bootstrap = async (): Promise<HttpHandler> => {
    const app = await createApp();
    await app.init();
    // O adapter padrão do Nest é Express: a instância é um handler (req, res).
    return app.getHttpAdapter().getInstance() as HttpHandler;
  };

  return async (req, res) => {
    // Guarda a promise (não o resultado): invocações simultâneas durante
    // o cold start esperam o mesmo bootstrap em vez de criar outro.
    cached ??= bootstrap().catch((error: unknown) => {
      cached = undefined; // falhou: a próxima invocação tenta de novo
      throw error;
    });
    const handle = await cached;
    handle(req, res);
  };
}
