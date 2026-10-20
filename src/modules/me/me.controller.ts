import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblemResponses } from '../../common/api-errors.decorator';
import { MeDto } from './me.schema';
import { MeService } from './me.service';

@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  // Spec 002 CA-02: quem está logado, com nome, papel e tenant.
  @Get()
  @ZodResponse({ status: 200, type: MeDto })
  @ApiProblemResponses(401, 403)
  get() {
    return this.service.get();
  }
}
