import { PrismaClient } from '@prisma/client';

// ADR-001 §5/§6: seed idempotente que cria o tenant `suporte_ti`. Roda em
// qualquer ambiente (inclusive no `prisma migrate reset`); não cria usuário
// nem dado de exemplo — isso é o seed-demo, só local.
export const DEFAULT_TENANT = { slug: 'suporte_ti', name: 'Suporte de TI' } as const;

export async function seedTenant(prisma: PrismaClient): Promise<{ id: string }> {
  return prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT.slug },
    update: {},
    create: DEFAULT_TENANT,
    select: { id: true },
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tenant = await seedTenant(prisma);
    console.log(`tenant ${DEFAULT_TENANT.slug} pronto (${tenant.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
