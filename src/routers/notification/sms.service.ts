import axios from 'axios';
import { env } from '../../config/env';

/**
 * SMS Service for sending notifications
 * 
 * This service handles sending SMS messages to users. It's configured to work
 * with Kavenegar, a popular Iranian SMS service, but you can adapt it to work
 * with any SMS provider by changing the API endpoint and request format.
 * 
 * The service is used to notify users about their payment links and subscription status.
 */
export class SmsService {
  private apiKey: string | undefined;
  private sender: string | undefined;
  private baseUrl = 'https://edge.ippanel.com/v1';

  constructor() {
    this.apiKey = env.SMS.API_KEY;
    this.sender = undefined;
  }

  /**
   * Sends an SMS message to a phone number
   * 
   * @param phone - Recipient's phone number (should be in format 09xxxxxxxxx)
   * @param message - The message content to send
   * @returns Promise that resolves when SMS is sent
   */
  async sendSms(phone: string, message: string): Promise<void> {
    try {
      if (!this.apiKey) {
        console.log(`[SMS Service] Would send to ${phone}: ${message}`);
        return;
      }
      const url = `${this.baseUrl}/messages/send`;
      const payload: any = {
        recipients: [phone],
        message,
      };
      if (this.sender) {
        payload.originator = this.sender;
      }
      await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${this.apiKey}`,
        },
      });
      console.log(`[SMS Service] SMS sent successfully to ${phone}`);
    } catch (error: any) {
      console.error('[SMS Service] Failed to send SMS:', error.message);
    }
  }

  private async sendPattern(
    patternCode: string | undefined,
    phone: string,
    values: Record<string, string>
  ): Promise<void> {
    if (!patternCode) {
      await this.sendSms(phone, Object.values(values).join(' '));
      return;
    }
    try {
      if (!this.apiKey) {
        console.log(`[SMS Service] Would send pattern ${patternCode} to ${phone}:`, values);
        return;
      }
      const url = `${this.baseUrl}/messages/patterns/send`;
      const payload: any = {
        pattern_code: patternCode,
        recipient: phone,
        values,
      };
      if (this.sender) {
        payload.originator = this.sender;
      }
      await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${this.apiKey}`,
        },
      });
      console.log(`[SMS Service] Pattern SMS sent successfully to ${phone}`);
    } catch (error: any) {
      console.error('[SMS Service] Failed to send Pattern SMS:', error.message);
    }
  }

  /**
   * Sends a payment link via SMS
   * 
   * This is a convenience method that formats a nice message with the payment link
   * 
   * @param phone - Recipient's phone number
   * @param paymentUrl - The payment URL to send
   * @param planName - Name of the subscription plan
   * @param amount - Payment amount
   */
  async sendPaymentLink(
    phone: string,
    paymentUrl: string,
    planName: string,
    amount: number
  ): Promise<void> {
    const values = {
      app_name: env.APP_NAME,
      plan_name: planName,
      amount: amount.toLocaleString('fa-IR'),
      payment_url: paymentUrl,
    };
    await this.sendPattern(env.SMS.PATTERN_CODE, phone, values);
  }

  /**
   * Sends a subscription activation notification
   * 
   * @param phone - Recipient's phone number
   * @param planName - Name of the subscription plan
   * @param endDate - When the subscription expires
   */
  async sendSubscriptionActivated(
    phone: string,
    planName: string,
    endDate: Date
  ): Promise<void> {
    const message = `${env.APP_NAME}
اشتراک ${planName} شما فعال شد.
تاریخ انقضا: ${endDate.toLocaleDateString('fa-IR')}`;
    await this.sendSms(phone, message);
  }
}
