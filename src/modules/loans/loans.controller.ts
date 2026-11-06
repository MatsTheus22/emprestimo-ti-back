import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiProblemResponses } from '../../common/api-errors.decorator';
import { CreateLoanDto, ListMyLoansQueryDto, LoanDto, MyLoansDto } from './loans.schema';
import { LoansService } from './loans.service';

@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private readonly service: LoansService) {}

  // Spec 004 CA-08 a CA-12 e CA-14: solicitar cria o empréstimo na hora.
  @Post()
  @ZodResponse({ status: 201, type: LoanDto })
  @ApiProblemResponses(400, 401, 403, 404, 409)
  create(@Body() body: CreateLoanDto) {
    return this.service.create(body.equipmentId);
  }

  // Spec 004 CA-15: empréstimos em aberto da própria pessoa.
  @Get('me')
  @ZodResponse({ status: 200, type: MyLoansDto })
  @ApiProblemResponses(400, 401, 403)
  listMine(@Query() query: ListMyLoansQueryDto) {
    return this.service.listMine(query);
  }
}
