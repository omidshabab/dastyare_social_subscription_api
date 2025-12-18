import { Subscription, Plan } from '@prisma/client';

export interface CreateSubscriptionInput {
  userId: string;
  planId: string;
  autoRenew?: boolean;
  userEmail?: string;
  userPhone?: string;
}

export interface NotificationData {
  email?: string;
  phone?: string;
  planName: string;
  amount?: number;
  paymentUrl?: string;
  endDate?: Date;
}

export interface GenericNotificationInput {
  type: 'sms' | 'email';
  recipient: string;
  message: string;
  subject?: string;
}
