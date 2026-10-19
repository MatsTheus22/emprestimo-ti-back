import { PrismaService } from '../../src/prisma/prisma.service';

// As URLs só existem quando o global-setup subiu o container. Sem elas, o
// teste falha em vez de cair em outro banco (como o Supabase local de dev).
function requireUrl(name: 'TEST_DATABASE_URL' | 'TEST_SUPERUSER_DATABASE_URL'): string {
  const url = process.env[name];
  if (!url) {
    throw new Error(`${name} ausente: rode os testes de banco com \`npm run test:db\`.`);
  }
  return url;
}

// Conecta como `postgres`, dono das tabelas — o mesmo papel da aplicação.
export function createTestPrisma(): PrismaService {
  return new PrismaService({ DATABASE_URL: requireUrl('TEST_DATABASE_URL') });
}

// Conecta como superusuário, para assumir papéis internos do Supabase.
export function createSuperuserTestPrisma(): PrismaService {
  return new PrismaService({ DATABASE_URL: requireUrl('TEST_SUPERUSER_DATABASE_URL') });
}
