import { Resend } from 'resend';
import { env } from '../../../config/env';

export class EmailService {
  private resend?: Resend;

  constructor() {
    if (env.RESEND.API_KEY) {
      this.resend = new Resend(env.RESEND.API_KEY);
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      if (!this.resend) {
        console.log(`[Email Service] Would send to ${to}: ${subject}`);
        return;
      }

      const { error } = await this.resend.emails.send({
        from: env.RESEND.FROM || 'no-reply@resend.dev',
        to,
        subject,
        html,
      });
      if (error) {
        throw error;
      }
      console.log(`[Email Service] Email sent to ${to}`);
    } catch (error: any) {
      console.error('[Email Service] Failed to send email:', error.message);
    }
  }

  async sendPaymentLink(to: string, paymentUrl: string, planName: string, amount: number): Promise<void> {
    const html = `
      <h1>Payment for ${planName}</h1>
      <p>Amount: ${amount.toLocaleString('fa-IR')} IRR</p>
      <p>Please click the link below to pay:</p>
      <a href="${paymentUrl}">Pay Now</a>
    `;
    await this.sendEmail(to, `Payment for ${planName}`, html);
  }

  async sendSubscriptionActivated(to: string, planName: string, endDate: Date): Promise<void> {
    const html = `
      <h1>Subscription Activated</h1>
      <p>Your subscription to ${planName} is now active.</p>
      <p>Expires on: ${endDate.toLocaleDateString('fa-IR')}</p>
    `;
    await this.sendEmail(to, `Subscription Activated - ${planName}`, html);
  }
}
