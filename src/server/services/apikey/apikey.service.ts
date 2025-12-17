import { PrismaClient, ApiKey } from '@prisma/client';
import crypto from 'crypto';

export class ApiKeyService {
  constructor(private prisma: PrismaClient) {}

  private hash(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  async create(label?: string): Promise<{ id: string; key: string; label?: string }> {
    const key = crypto.randomBytes(32).toString('hex');
    const hash = this.hash(key);
    const created = await this.prisma.apiKey.create({
      data: { label, hash },
      select: { id: true, label: true },
    });
    return { id: created.id, key, label: created.label || undefined };
  }

  async list(): Promise<Array<Pick<ApiKey, 'id' | 'label' | 'isActive' | 'createdAt' | 'updatedAt' | 'lastUsedAt'>>> {
    return this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
      },
    });
  }

  async deactivate(id: string): Promise<boolean> {
    const found = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!found) return false;
    await this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });
    return true;
  }

  async verifyAndTouch(key: string): Promise<boolean> {
    const hash = this.hash(key);
    const found = await this.prisma.apiKey.findUnique({ where: { hash } });
    if (!found || !found.isActive) return false;
    await this.prisma.apiKey.update({
      where: { id: found.id },
      data: { lastUsedAt: new Date() },
    });
    return true;
  }
}
