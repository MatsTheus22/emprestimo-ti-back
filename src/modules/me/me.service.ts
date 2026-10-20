import { ForbiddenException, Injectable } from '@nestjs/common';
import { AppRole, RequestContext } from '../../common/request-context';
import { NO_ACCESS_MESSAGE } from '../auth/auth.guard';
import { MeRepository } from './me.repository';
import type { Me } from './me.schema';

@Injectable()
export class MeService {
  constructor(private readonly repository: MeRepository) {}

  async get(): Promise<Me> {
    const { userId, tenantId } = RequestContext.auth();
    const membership = await this.repository.findMembership(userId, tenantId);
    // Token ainda válido, mas a membership foi removida depois de emitido.
    if (!membership) throw new ForbiddenException(NO_ACCESS_MESSAGE);
    // O CHECK memberships_role_check garante um dos dois papéis.
    return { ...membership, role: membership.role as AppRole };
  }
}
