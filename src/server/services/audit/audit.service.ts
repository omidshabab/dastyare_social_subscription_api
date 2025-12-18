import { PrismaClient } from '@prisma/client';

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  async log(data: {
    userId?: string;
    action: string;
    targetType?: string;
    targetId?: string;
    ip?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data });
    } catch {
      // swallow
    }
  }
}
