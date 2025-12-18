import { PrismaClient, Webhook, WebhookDelivery } from '@prisma/client';
import axios from 'axios';
import crypto from 'crypto';

export class WebhookService {
  constructor(private prisma: PrismaClient) {}

  async list(userId: string): Promise<Webhook[]> {
    return this.prisma.webhook.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async create(userId: string, url: string, eventTypes: string[], secret?: string): Promise<Webhook> {
    const sec = secret || crypto.randomBytes(32).toString('hex');
    return this.prisma.webhook.create({
      data: { userId, url, eventTypes: eventTypes as any, secret: sec, isActive: true },
    });
  }

  async update(userId: string, id: string, data: Partial<Pick<Webhook, 'url' | 'isActive'>> & { eventTypes?: string[] }): Promise<Webhook | null> {
    const found = await this.prisma.webhook.findUnique({ where: { id } });
    if (!found || found.userId !== userId) return null;
    return this.prisma.webhook.update({
      where: { id },
      data: { url: data.url ?? found.url, isActive: data.isActive ?? found.isActive, eventTypes: (data.eventTypes ?? (found.eventTypes as any)) as any },
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const found = await this.prisma.webhook.findUnique({ where: { id } });
    if (!found || found.userId !== userId) return false;
    await this.prisma.webhook.delete({ where: { id } });
    return true;
  }

  private sign(secret: string, payload: any): string {
    const h = crypto.createHmac('sha256', secret);
    h.update(JSON.stringify(payload));
    return h.digest('hex');
  }

  async dispatch(userId: string, eventType: string, payload: any): Promise<void> {
    const hooks = await this.prisma.webhook.findMany({ where: { userId, isActive: true } });
    for (const hook of hooks) {
      const types = (hook.eventTypes as any as string[]) || [];
      if (types.length && !types.includes(eventType)) continue;
      const signature = this.sign(hook.secret, payload);
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          eventType,
          payload,
          signature,
          status: 'PENDING',
          attemptCount: 0,
        } as any,
      });
      await this.tryDeliver(hook, delivery);
    }
  }

  private async tryDeliver(hook: Webhook, delivery: WebhookDelivery): Promise<void> {
    const maxAttempts = 3;
    const backoff = [0, 1000, 3000];
    for (let i = delivery.attemptCount; i < maxAttempts; i++) {
      try {
        if (backoff[i] > 0) await new Promise(r => setTimeout(r, backoff[i]));
        await axios.post(hook.url, delivery.payload, {
          headers: {
            'X-Webhook-Event': delivery.eventType,
            'X-Webhook-Signature': delivery.signature,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        });
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SUCCESS', attemptCount: i + 1, lastAttemptAt: new Date() } as any,
        });
        return;
      } catch (err) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: i + 1 >= maxAttempts ? 'FAILED' : 'PENDING', attemptCount: i + 1, lastAttemptAt: new Date() } as any,
        });
      }
    }
  }
}
