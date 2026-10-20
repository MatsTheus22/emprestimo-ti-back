import { Controller, Get } from '@nestjs/common';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { Public } from '../auth/public.decorator';

const HealthSchema = z.object({ status: z.literal('ok') });
class HealthDto extends createZodDto(HealthSchema) {}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ZodResponse({ status: 200, type: HealthDto })
  check() {
    return { status: 'ok' as const };
  }
}
