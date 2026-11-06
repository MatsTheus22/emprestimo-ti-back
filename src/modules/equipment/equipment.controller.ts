import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblemResponses } from '../../common/api-errors.decorator';
import { EquipmentListDto, ListEquipmentQueryDto } from './equipment.schema';
import { EquipmentService } from './equipment.service';

@ApiBearerAuth()
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly service: EquipmentService) {}

  // Spec 004 CA-05 e CA-06: catálogo do tenant do token.
  @Get()
  @ZodResponse({ status: 200, type: EquipmentListDto })
  @ApiProblemResponses(400, 401, 403)
  list(@Query() query: ListEquipmentQueryDto) {
    return this.service.list(query);
  }
}
