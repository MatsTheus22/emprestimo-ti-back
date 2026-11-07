import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeRepository } from './me.repository';
import { MeService } from './me.service';

@Module({
  controllers: [MeController],
  providers: [MeService, MeRepository],
  exports: [MeService],
})
export class MeModule {}
