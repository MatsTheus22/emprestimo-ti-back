import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { EquipmentController } from './equipment.controller';
import { EquipmentRepository } from './equipment.repository';
import { EquipmentService } from './equipment.service';

@Module({
  imports: [MeModule],
  controllers: [EquipmentController],
  providers: [EquipmentService, EquipmentRepository],
})
export class EquipmentModule {}
