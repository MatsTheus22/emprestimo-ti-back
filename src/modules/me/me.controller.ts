import { Controller, Get } from '@nestjs/common';
import { Me, MeService } from './me.service';

@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  // Spec 002 CA-02: quem está logado, com nome, papel e tenant.
  @Get()
  get(): Promise<Me> {
    return this.service.get();
  }
}
