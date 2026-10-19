import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';

// ADR-001 §4: todo erro sai em RFC 9457 (Problem Details), para o front
// tratar falha por status/type e nunca lendo string de mensagem.
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  errors?: unknown;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const problem: ProblemDetails = {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      instance: req.originalUrl.split('?')[0] ?? req.originalUrl,
    };

    if (exception instanceof HttpException && status < 500) {
      Object.assign(problem, detailsFrom(exception));
    } else {
      // Erro inesperado: detalhe só no log, nunca na resposta.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).type('application/problem+json').json(problem);
  }
}

function detailsFrom(exception: HttpException): Pick<ProblemDetails, 'detail' | 'errors'> {
  const body = exception.getResponse();
  if (typeof body === 'string') return { detail: body };

  const { message, errors } = body as { message?: unknown; errors?: unknown };
  return {
    ...(typeof message === 'string' && { detail: message }),
    ...(errors !== undefined && { errors }),
  };
}
