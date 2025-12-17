import axios from 'axios';
import { env } from '../../../config/env';

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
  private baseUrl = 'https://api.kavenegar.com/v1';

  constructor() {
    this.apiKey = env.SMS.API_KEY;
    this.sender = env.SMS.SENDER;
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
      // If SMS API key is not configured, just log the message
      // This is useful for development/testing
      if (!this.apiKey || this.apiKey === 'your-sms-api-key') {
        console.log(`[SMS Service] Would send to ${phone}: ${message}`);
        return;
      }

      // Construct the API endpoint URL with the API key
      const url = `${this.baseUrl}/${this.apiKey}/sms/send.json`;

      // Make the API request to Kavenegar
      await axios.post(url, {
        sender: this.sender,
        receptor: phone,
        message: message,
      });

      console.log(`[SMS Service] SMS sent successfully to ${phone}`);
    } catch (error: any) {
      console.error('[SMS Service] Failed to send SMS:', error.message);
      // We don't throw here because SMS failure shouldn't break the payment flow
      // The payment link is also available in the API response
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
    const message = `${env.APP_NAME}
اشتراک: ${planName}
مبلغ: ${amount.toLocaleString('fa-IR')} ریال
لینک پرداخت: ${paymentUrl}`;

    await this.sendSms(phone, message);
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
