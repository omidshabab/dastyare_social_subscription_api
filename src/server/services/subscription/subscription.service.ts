import { PrismaClient, Subscription, Plan } from '@prisma/client';
import { SubscriptionStatus } from '../../../types/enums';
import { PaymentService } from '../payment/payment.service';
import { NotificationService } from '../notification/notification.service';
import { CreateSubscriptionInput } from '../../../types/subscription.types';
import { NotFoundError } from '../../../utils/errors';
import { WebhookService } from '../webhook/webhook.service';
import { AuditService } from '../audit/audit.service';

/**
 * Subscription Service
 * 
 * This service manages the entire lifecycle of subscriptions. It coordinates between
 * payment processing and subscription management to ensure users get access when they
 * should and lose it when their subscription expires.
 * 
 * The service handles:
 * - Creating new subscriptions and initiating payment
 * - Activating subscriptions after successful payment
 * - Managing subscription status (active, expired, cancelled)
 * - Querying subscriptions by user or status
 */
export class SubscriptionService {
  private prisma: PrismaClient;
  private paymentService: PaymentService;
  private notificationService: NotificationService;
  private webhookService: WebhookService;
  private audit: AuditService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.paymentService = new PaymentService(prisma);
    this.notificationService = new NotificationService();
    this.webhookService = new WebhookService(prisma);
    this.audit = new AuditService(prisma);
  }

  /**
   * Creates a new subscription and initiates payment
   * 
   * This is the main entry point for users starting a subscription. The method:
   * 1. Validates that the plan exists and is active
   * 2. Creates a subscription record in PENDING status
   * 3. Creates a payment request for the subscription
   * 4. Returns the subscription with payment details including the payment link
   * 
   * The user then receives the payment link via SMS/email and can complete payment.
   * Once payment is verified, the subscription will be activated.
   * 
   * @param input - Subscription creation details (userId, planId, contact info, etc.)
   * @returns Created subscription with payment details and payment URL
   */
  async createSubscription(input: CreateSubscriptionInput) {
    // First, verify the plan exists and is available
    const plan = await this.prisma.plan.findUnique({
      where: { id: input.planId },
    });

    if (!plan) {
      throw new NotFoundError('Plan');
    }

    if (!plan.isActive) {
      throw new Error('This plan is not currently available');
    }

    // Create the subscription in PENDING status
    // It will be activated once payment is verified
    const subscription = await this.prisma.subscription.create({
      data: {
        userId: input.userId,
        planId: input.planId,
        status: SubscriptionStatus.PENDING,
        autoRenew: input.autoRenew || false,
      },
      include: {
        plan: true,
      },
    });

    // Create a payment for this subscription
    // This generates the payment link that will be sent to the user
    const payment = await this.paymentService.createPayment(
      subscription.id,
      plan.price,
      input.gateway || 'zarinpal',
      input.userEmail,
      input.userPhone
    );

    // Return the subscription with payment details
    // The frontend can use the payment URL to redirect the user
    return {
      subscription,
      payment: {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        paymentUrl: payment.paymentUrl,
        authority: payment.authority,
        status: payment.status,
      },
    };
  }

  /**
   * Activates a subscription after successful payment
   * 
   * This method is called after a payment has been verified. It:
   * 1. Calculates the subscription start and end dates
   * 2. Updates the subscription status to ACTIVE
   * 3. Sends a confirmation notification to the user
   * 
   * The subscription duration comes from the plan (e.g., 30 days for monthly)
   * 
   * @param subscriptionId - The subscription to activate
   * @param userEmail - User's email for notification
   * @param userPhone - User's phone for notification
   * @returns Updated subscription with active status and dates
   */
  async activateSubscription(
    subscriptionId: string,
    userEmail?: string,
    userPhone?: string
  ): Promise<Subscription> {
    // Get the subscription with its plan details
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + subscription.plan.duration);

    // Update the subscription to ACTIVE status
    const updatedSubscription = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate,
      },
      include: { plan: true },
    });

    // Send activation notification to the user
    await this.notificationService.sendSubscriptionActivated(
      userEmail,
      userPhone,
      subscription.plan.name,
      endDate
    );

    await this.audit.log({
      userId: updatedSubscription.userId,
      action: 'SUBSCRIPTION_ACTIVATED',
      targetType: 'Subscription',
      targetId: updatedSubscription.id,
      metadata: { planId: updatedSubscription.planId },
    });

    await this.webhookService.dispatch(
      updatedSubscription.userId,
      'subscription.activated',
      {
        id: updatedSubscription.id,
        userId: updatedSubscription.userId,
        planId: updatedSubscription.planId,
        startDate: updatedSubscription.startDate,
        endDate: updatedSubscription.endDate,
      }
    );

    return updatedSubscription;
  }

  /**
   * Gets a subscription by ID with plan details
   * 
   * @param id - Subscription ID
   * @returns Subscription with plan information
   */
  async getSubscription(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    return subscription;
  }

  /**
   * Gets all subscriptions for a specific user
   * 
   * This is useful for showing a user their subscription history and current status
   * 
   * @param userId - The user's ID
   * @returns Array of subscriptions with plan details
   */
  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      include: {
        plan: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Only get the most recent payment
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Gets a user's active subscription
   * 
   * This checks if the user has any active subscription and returns it.
   * Useful for checking if a user has access to premium features.
   * 
   * @param userId - The user's ID
   * @returns Active subscription or null if none exists
   */
  async getActiveSubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
        endDate: {
          gte: new Date(), // End date is in the future
        },
      },
      include: {
        plan: true,
      },
    });
  }

  /**
   * Cancels a subscription
   * 
   * This sets the subscription status to CANCELLED. The user typically keeps
   * access until their current period ends (based on endDate), but they won't
   * be charged again.
   * 
   * @param subscriptionId - The subscription to cancel
   * @returns Updated subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    return this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.CANCELLED,
        autoRenew: false,
      },
    });
  }

  /**
   * Creates a new subscription plan
   * 
   * This is typically used by admins to set up different subscription tiers
   * (e.g., Monthly, Yearly, Premium, etc.)
   * 
   * @param data - Plan details (name, price, duration, etc.)
   * @returns Created plan
   */
  async createPlan(data: {
    name: string;
    description?: string;
    price: number;
    currency?: string;
    duration: number;
    features?: any;
    isActive?: boolean;
  }): Promise<Plan> {
    return this.prisma.plan.create({
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        currency: data.currency || 'IRR',
        duration: data.duration,
        features: data.features,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Gets all available plans
   * 
   * Returns only active plans that users can subscribe to
   * 
   * @returns Array of active plans
   */
  async getAvailablePlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  /**
   * Gets all plans (including inactive)
   * 
   * This is typically used by admins to manage plans
   * 
   * @returns Array of all plans
   */
  async getAllPlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
