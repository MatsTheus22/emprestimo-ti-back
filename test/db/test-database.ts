import { PrismaService } from '../../src/prisma/prisma.service';

// Só existe quando o global-setup subiu o container. Sem ele, o teste
// falha em vez de cair em outro banco (como o Supabase local de dev).
export function createTestPrisma(): PrismaService {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL ausente: rode os testes de banco com `npm run test:db`.');
  }
  return new PrismaService({ DATABASE_URL: url });
}
