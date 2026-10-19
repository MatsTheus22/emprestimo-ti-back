import { ForbiddenException, Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/request-context';
import { NO_ACCESS_MESSAGE } from '../auth/auth.guard';
import { MeRepository } from './me.repository';

export interface Me {
  userId: string;
  displayName: string;
  role: string;
  tenant: { id: string; slug: string; name: string };
}

@Injectable()
export class MeService {
  constructor(private readonly repository: MeRepository) {}

  async get(): Promise<Me> {
    const { userId, tenantId } = RequestContext.auth();
    const membership = await this.repository.findMembership(userId, tenantId);
    // Token ainda válido, mas a membership foi removida depois de emitido.
    if (!membership) throw new ForbiddenException(NO_ACCESS_MESSAGE);
    return membership;
  }
}
