import nodemailer from 'nodemailer';
import { env } from '../../../config/env';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.EMAIL.HOST,
      port: env.EMAIL.PORT,
      secure: env.EMAIL.PORT === 465, // true for 465, false for other ports
      auth: {
        user: env.EMAIL.USER,
        pass: env.EMAIL.PASS,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      if (!env.EMAIL.HOST || !env.EMAIL.USER) {
        console.log(`[Email Service] Would send to ${to}: ${subject}`);
        return;
      }

      await this.transporter.sendMail({
        from: env.EMAIL.FROM,
        to,
        subject,
        html,
      });
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
