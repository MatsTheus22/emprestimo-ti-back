import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface MembershipWithTenant {
  userId: string;
  role: string;
  displayName: string;
  tenant: { id: string; slug: string; name: string };
}

@Injectable()
export class MeRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Sempre filtrado por usuário E tenant: o tenant vem do token, então um
  // usuário com membership em outro tenant nunca recebe dado de lá.
  findMembership(userId: string, tenantId: string): Promise<MembershipWithTenant | null> {
    return this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: {
        userId: true,
        role: true,
        displayName: true,
        tenant: { select: { id: true, slug: true, name: true } },
      },
    });
  }
}
