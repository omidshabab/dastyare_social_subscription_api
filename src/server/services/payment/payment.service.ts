import { PrismaClient, Payment } from '@prisma/client';
import { PaymentStatus } from '../../../types/enums';
import { getPaymentGateway } from './gateways';
import { NotificationService } from '../notification/notification.service';
import {
  CreatePaymentRequest,
  CreatePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from '../../../types/payment.types';
import { NotFoundError, PaymentGatewayError } from '../../../utils/errors';
import { env } from '../../../config/env';

/**
 * Payment Service
 * 
 * This service handles all payment-related operations. It acts as a bridge between
 * your application, the payment gateways, and the database. Think of it as the
 * "business logic" layer that coordinates all the moving parts of a payment flow.
 * 
 * Key responsibilities:
 * - Creating payment requests and storing them in the database
 * - Sending payment links to users via notifications
 * - Verifying completed payments and updating records
 * - Managing the lifecycle of payment transactions
 */
export class PaymentService {
  private prisma: PrismaClient;
  private notificationService: NotificationService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.notificationService = new NotificationService();
  }

  /**
   * Creates a new payment for a subscription
   * 
   * This is where the payment journey begins. When a user wants to subscribe,
   * this method:
   * 1. Gets the right payment gateway (Zarinpal, Zibal, etc.)
   * 2. Creates a payment request with the gateway
   * 3. Stores the payment record in our database
   * 4. Sends the payment link to the user
   * 
   * @param subscriptionId - The subscription this payment is for
   * @param amount - Payment amount in smallest currency unit
   * @param gateway - Which payment gateway to use (e.g., 'zarinpal')
   * @param userEmail - User's email for notifications
   * @param userPhone - User's phone for notifications
   * @returns Payment details including the URL where user can pay
   */
  async createPayment(
    subscriptionId: string,
    amount: number,
    gateway: string,
    userEmail?: string,
    userPhone?: string
  ): Promise<Payment> {
    // Get the subscription to include plan details in the payment description
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    // Get the appropriate payment gateway instance
    const paymentGateway = getPaymentGateway(gateway);

    // Prepare the payment request for the gateway
    const paymentRequest: CreatePaymentRequest = {
      amount,
      description: `Subscription: ${subscription.plan.name}`,
      callbackUrl: `${env.API_BASE_URL}/api/payment/verify`,
      email: userEmail,
      mobile: userPhone,
      metadata: {
        subscriptionId,
        planId: subscription.planId,
      },
    };

    // Create the payment with the gateway
    const gatewayResponse: CreatePaymentResponse = await paymentGateway.createPayment(
      paymentRequest
    );

    // Store the payment record in our database
    const payment = await this.prisma.payment.create({
      data: {
        subscriptionId,
        amount,
        currency: subscription.plan.currency,
        gateway,
        authority: gatewayResponse.authority,
        paymentUrl: gatewayResponse.paymentUrl,
        status: PaymentStatus.PENDING,
        userEmail,
        userPhone,
        metadata: JSON.stringify({
          gatewayTxId: gatewayResponse.gatewayTxId,
          message: gatewayResponse.message,
        }),
      },
    });

    // Send the payment link to the user via SMS/Email
    await this.notificationService.sendPaymentLink(
      userEmail,
      userPhone,
      gatewayResponse.paymentUrl,
      subscription.plan.name,
      amount
    );

    // Mark that we've sent the notification
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { notificationSent: true },
    });

    return payment;
  }

  /**
   * Verifies a payment after user completes it
   * 
   * After the user pays on the gateway's website, they get redirected back to
   * our callback URL. This method:
   * 1. Finds the payment record using the authority
   * 2. Verifies with the gateway that payment was actually completed
   * 3. Updates our database with the verification result
   * 4. Returns the updated payment record
   * 
   * Important: This is a critical security step. Never trust the redirect URL
   * parameters alone - always verify with the gateway's API.
   * 
   * @param authority - The unique payment reference from the gateway
   * @param status - Status parameter from the gateway callback
   * @returns Updated payment record with verification details
   */
  async verifyPayment(
    authority: string,
    status?: string
  ): Promise<Payment> {
    // Find the payment record in our database
    const payment = await this.prisma.payment.findFirst({
      where: { authority },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    // If the gateway indicates the payment was cancelled or failed,
    // update our record and throw an error
    if (status === 'NOK' || status === 'cancel') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw new PaymentGatewayError('Payment was cancelled or failed');
    }

    // Don't verify if already completed (prevents duplicate verification)
    if (payment.status === PaymentStatus.COMPLETED) {
      return payment;
    }

    // Get the payment gateway and verify the payment
    const paymentGateway = getPaymentGateway(payment.gateway);
    
    const verifyRequest: VerifyPaymentRequest = {
      authority: payment.authority!,
      amount: payment.amount,
    };

    let verifyResponse: VerifyPaymentResponse;
    
    try {
      verifyResponse = await paymentGateway.verifyPayment(verifyRequest);
    } catch (error) {
      // If verification fails, update the payment status
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw error;
    }

    // Update the payment record with verification details
    const existingMetadata = payment.metadata ? JSON.parse(payment.metadata) : {};

    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.COMPLETED,
        gatewayTxId: verifyResponse.refId,
        paidAt: new Date(),
        verifiedAt: new Date(),
        metadata: JSON.stringify({
          ...existingMetadata,
          refId: verifyResponse.refId,
          cardPan: verifyResponse.cardPan,
          cardHash: verifyResponse.cardHash,
          feeType: verifyResponse.feeType,
          fee: verifyResponse.fee,
        }),
      },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    });

    return updatedPayment;
  }

  /**
   * Gets a payment by its authority (unique reference)
   * 
   * @param authority - The unique payment reference
   * @returns Payment record with subscription and plan details
   */
  async getPaymentByAuthority(authority: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { authority },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    });
  }

  /**
   * Gets all payments for a specific subscription
   * 
   * This is useful for showing payment history to users or admins
   * 
   * @param subscriptionId - The subscription ID
   * @returns Array of payment records
   */
  async getPaymentsBySubscription(subscriptionId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}