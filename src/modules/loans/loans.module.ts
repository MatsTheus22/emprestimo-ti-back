import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { LoansController } from './loans.controller';
import { LoansRepository } from './loans.repository';
import { LoansService } from './loans.service';

@Module({
  imports: [MeModule],
  controllers: [LoansController],
  providers: [LoansService, LoansRepository],
})
export class LoansModule {}
