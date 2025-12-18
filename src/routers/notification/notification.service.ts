import { SmsService } from './sms.service';
import { EmailService } from './email.service';
import { GenericNotificationInput } from '../../types/subscription.types';

/**
 * Notification Service
 * 
 * This service acts as a unified interface for sending notifications across
 * multiple channels (SMS and Email). Instead of calling SmsService or EmailService
 * directly throughout your code, you use this NotificationService which decides
 * which channel(s) to use based on what contact information is available.
 * 
 * This abstraction makes it easy to:
 * - Add new notification channels (push notifications, webhooks, etc.)
 * - Send to multiple channels at once
 * - Handle failures gracefully without breaking the main flow
 */
export class NotificationService {
  private smsService: SmsService;
  private emailService: EmailService;

  constructor() {
    this.smsService = new SmsService();
    this.emailService = new EmailService();
  }

  /**
   * Sends a payment link to the user
   * 
   * This method intelligently sends the payment link via SMS and/or email
   * depending on what contact information is available. If both are provided,
   * it sends via both channels for better reach.
   * 
   * @param email - User's email address (optional)
   * @param phone - User's phone number (optional)
   * @param paymentUrl - The payment URL to send
   * @param planName - Name of the subscription plan
   * @param amount - Payment amount
   */
  async sendPaymentLink(
    email: string | undefined,
    phone: string | undefined,
    paymentUrl: string,
    planName: string,
    amount: number
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    // Send via SMS if phone number is provided
    if (phone) {
      promises.push(
        this.smsService.sendPaymentLink(phone, paymentUrl, planName, amount)
      );
    }

    // Send via Email if email address is provided
    if (email) {
      promises.push(
        this.emailService.sendPaymentLink(email, paymentUrl, planName, amount)
      );
    }

    // Wait for all notifications to be sent
    // Using Promise.allSettled instead of Promise.all means that if one
    // notification fails, the others will still be sent
    await Promise.allSettled(promises);
  }

  /**
   * Sends a subscription activation notification
   * 
   * This notifies the user that their payment was successful and their
   * subscription is now active.
   * 
   * @param email - User's email address (optional)
   * @param phone - User's phone number (optional)
   * @param planName - Name of the subscription plan
   * @param endDate - When the subscription expires
   */
  async sendSubscriptionActivated(
    email: string | undefined,
    phone: string | undefined,
    planName: string,
    endDate: Date
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    // Send via SMS if phone number is provided
    if (phone) {
      promises.push(
        this.smsService.sendSubscriptionActivated(phone, planName, endDate)
      );
    }

    // Send via Email if email address is provided
    if (email) {
      promises.push(
        this.emailService.sendSubscriptionActivated(email, planName, endDate)
      );
    }

    // Wait for all notifications to be sent
    await Promise.allSettled(promises);
  }

  /**
   * Generic notification sender
   * 
   * This is a flexible method that can send any type of notification based
   * on the provided data. You can use this for custom notifications beyond
   * the predefined ones above.
   * 
   * @param data - Notification data including type, recipient, and message
   */
  async sendNotification(data: GenericNotificationInput): Promise<void> {
    try {
      if (data.type === 'sms') {
        await this.smsService.sendSms(data.recipient, data.message);
      } else if (data.type === 'email') {
        await this.emailService.sendEmail(
          data.recipient,
          data.subject || 'Notification',
          data.message
        );
      }
    } catch (error) {
      console.error('[Notification Service] Failed to send notification:', error);
      // We don't throw here because notification failure shouldn't break the main flow
    }
  }
}