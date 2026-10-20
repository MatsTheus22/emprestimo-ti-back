import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

// Rota sem token (ex.: /v1/health). Todo o resto exige autenticação.
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
