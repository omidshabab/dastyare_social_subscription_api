import { PrismaClient, User, OtpCode } from '@prisma/client';
import crypto from 'crypto';
import { env } from '../../../config/env';
import { SmsService } from '../notification/sms.service';

type RateEntry = { count: number; windowStart: number };

export class AuthService {
  private prisma: PrismaClient;
  private sms: SmsService;
  private rate: Map<string, RateEntry> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.sms = new SmsService();
  }

  private normalizePhone(phone: string): string {
    let p = phone.trim();
    if (p.startsWith('+98')) p = '0' + p.slice(3);
    return p;
  }

  private randCode(): string {
    const len = env.AUTH.OTP_LENGTH;
    const max = Math.pow(10, len) - 1;
    const min = Math.pow(10, len - 1);
    const n = crypto.randomInt(min, max + 1);
    return String(n).padStart(len, '0');
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private now(): number {
    return Date.now();
  }

  private checkRateLimit(key: string): void {
    const windowMs = env.AUTH.RATE_LIMIT_WINDOW_SEC * 1000;
    const maxReq = env.AUTH.RATE_LIMIT_MAX_REQUESTS;
    const now = this.now();
    const entry = this.rate.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      this.rate.set(key, { count: 1, windowStart: now });
      return;
    }
    if (entry.count >= maxReq) {
      throw new Error('Too many OTP requests. Please wait and try again.');
    }
    entry.count += 1;
    this.rate.set(key, entry);
  }

  async requestOtp(rawPhone: string): Promise<void> {
    const phone = this.normalizePhone(rawPhone);
    this.checkRateLimit(`otp:${phone}`);

    const code = this.randCode();
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + env.AUTH.OTP_EXP_MIN * 60_000);

    await this.prisma.otpCode.create({
      data: { phone, codeHash, expiresAt },
    });

    const values = {
      app_name: env.APP_NAME,
      code,
      minutes: String(env.AUTH.OTP_EXP_MIN),
    };
    await (this.sms as any)['sendPattern']?.(env.SMS.OTP_PATTERN_CODE, phone, values);
  }

  async verifyOtp(rawPhone: string, code: string): Promise<{ user: User; apiKey: string }> {
    const phone = this.normalizePhone(rawPhone);
    const record = await this.prisma.otpCode.findFirst({
      where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new Error('OTP not found or expired');
    const codeHash = this.hashCode(code);
    const ok = record.codeHash === codeHash;
    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: record.attempts + 1, usedAt: ok ? new Date() : record.usedAt },
    });
    if (!ok) throw new Error('Invalid OTP code');

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, role: 'USER' },
      });
    }

    const apiKeyPlain = crypto.randomBytes(32).toString('hex');
    const apiHash = crypto.createHash('sha256').update(apiKeyPlain).digest('hex');
    await this.prisma.apiKey.create({
      data: { userId: user.id, hash: apiHash, label: 'login' },
    });

    return { user, apiKey: apiKeyPlain };
  }

  async validateOtp(rawPhone: string, code: string): Promise<boolean> {
    const phone = this.normalizePhone(rawPhone);
    const record = await this.prisma.otpCode.findFirst({
      where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return false;
    const codeHash = this.hashCode(code);
    const ok = record.codeHash === codeHash;
    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: record.attempts + 1, usedAt: ok ? new Date() : record.usedAt },
    });
    return ok;
  }
}
