import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { ENV } from '../config/env.module';

// Conexão é preguiçosa (primeira query); em serverless isso evita abrir
// conexão em invocações que não tocam o banco, como /v1/health.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Pick<Env, 'DATABASE_URL'>) {
    super({ datasourceUrl: env.DATABASE_URL });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
