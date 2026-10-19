import { Module } from '@nestjs/common';
import { EnvModule } from './config/env.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [EnvModule, PrismaModule, HealthModule],
})
export class AppModule {}
