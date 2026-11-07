import { ConflictException } from '@nestjs/common';
import { LIMITE_EMPRESTIMOS } from './loans.rules';

// O front decide pelo `type` (ADR-001 §4), nunca lendo a mensagem.
export const TIPO_INDISPONIVEL = 'urn:emprestai:erro:equipamento-indisponivel';
export const TIPO_LIMITE = 'urn:emprestai:erro:limite-emprestimos';
export const TIPO_ATRASO = 'urn:emprestai:erro:emprestimo-em-atraso';

export function equipamentoIndisponivel(): ConflictException {
  return new ConflictException({
    type: TIPO_INDISPONIVEL,
    message: 'Este equipamento não está disponível.',
  });
}

export function limiteAtingido(): ConflictException {
  return new ConflictException({
    type: TIPO_LIMITE,
    message: `Você já tem ${LIMITE_EMPRESTIMOS} empréstimos em aberto.`,
  });
}

export function emprestimoEmAtraso(): ConflictException {
  return new ConflictException({
    type: TIPO_ATRASO,
    message: 'Você tem empréstimo em atraso e não pode solicitar outro.',
  });
}
