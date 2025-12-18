import { PrismaClient, GatewayCredential } from '@prisma/client';
import { PaymentGatewayConfig } from '../../../types/payment.types';
import { NotFoundError, ValidationError } from '../../../utils/errors';

export class GatewayCredentialService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async upsert(userId: string, gateway: string, merchantId: string, sandbox?: boolean, config?: Record<string, any>): Promise<GatewayCredential> {
    if (!merchantId || !merchantId.trim()) {
      throw new ValidationError('merchantId is required');
    }
    const data = {
      userId,
      gateway: gateway.toLowerCase(),
      merchantId: merchantId.trim(),
      sandbox: sandbox ?? true,
      config: config ? JSON.parse(JSON.stringify(config)) : undefined,
    };
    const existing = await this.prisma.gatewayCredential.findUnique({
      where: { userId_gateway: { userId, gateway: data.gateway } },
    });
    if (existing) {
      return this.prisma.gatewayCredential.update({
        where: { userId_gateway: { userId, gateway: data.gateway } },
        data,
      });
    }
    return this.prisma.gatewayCredential.create({ data });
  }

  async get(userId: string, gateway: string): Promise<GatewayCredential | null> {
    return this.prisma.gatewayCredential.findUnique({
      where: { userId_gateway: { userId, gateway: gateway.toLowerCase() } },
    });
  }

  async list(userId: string): Promise<GatewayCredential[]> {
    return this.prisma.gatewayCredential.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async requireConfig(userId: string, gateway: string): Promise<PaymentGatewayConfig> {
    const cred = await this.get(userId, gateway);
    if (!cred) {
      throw new ValidationError(`No credentials found for gateway '${gateway}'. Set credentials in your account.`);
    }
    return { merchantId: cred.merchantId, sandbox: cred.sandbox };
  }
}
