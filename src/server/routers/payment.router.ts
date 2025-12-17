import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { PaymentService } from '../services/payment/payment.service';
import { SubscriptionService } from '../services/subscription/subscription.service';
import { verifyPaymentSchema } from '../../utils/validators';

/**
 * Payment Router
 * 
 * This router handles payment-related endpoints, particularly payment verification.
 * 
 * The most important endpoint here is `verify`, which is called when a user returns
 * from the payment gateway. This is where we confirm the payment was successful
 * and activate the subscription.
 */
export const paymentRouter = router({
  /**
   * Verifies a payment and activates the subscription
   * 
   * This is a critical endpoint that gets called in two ways:
   * 
   * 1. As a callback from the payment gateway (Zarinpal redirects here)
   * 2. From your frontend after the user returns from payment
   * 
   * The flow works like this:
   * - User completes payment on Zarinpal's website
   * - Zarinpal redirects user back to your app with authority and status parameters
   * - Your frontend calls this endpoint with those parameters
   * - We verify with Zarinpal that the payment was actually completed
   * - If verified, we activate the subscription
   * - User gets notified and gains access to premium features
   * 
   * Example usage from Next.js:
   * // User returns from Zarinpal to: /payment/callback?Authority=xxx&Status=OK
   * const result = await trpc.payment.verify.mutate({
   *   authority: searchParams.get('Authority'),
   *   status: searchParams.get('Status')
   * });
   * if (result.success) {
   *   // Show success message and redirect to dashboard
   * }
   */
  verify: publicProcedure
    .input(verifyPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      const paymentService = new PaymentService(ctx.prisma);
      const subscriptionService = new SubscriptionService(ctx.prisma);

      // Step 1: Verify the payment with the gateway
      const payment = await paymentService.verifyPayment(
        input.authority,
        input.status
      );

      // Step 2: Activate the subscription if payment was successful
      if (payment.status === 'COMPLETED') {
        await subscriptionService.activateSubscription(
          payment.subscriptionId,
          payment.userEmail || undefined,
          payment.userPhone || undefined
        );
      }

      // Step 3: Return the verification result
      return {
        success: payment.status === 'COMPLETED',
        payment: {
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          paidAt: payment.paidAt,
          gatewayTxId: payment.gatewayTxId,
        },
        subscriptionId: payment.subscriptionId,
      };
    }),

  /**
   * Gets a payment by its authority
   * 
   * This can be used to check the status of a payment while waiting for verification.
   * 
   * Example usage:
   * const payment = await trpc.payment.getByAuthority.query({ 
   *   authority: "A00000000000000000000000000123456" 
   * });
   */
  getByAuthority: publicProcedure
    .input(z.object({ authority: z.string() }))
    .query(async ({ ctx, input }) => {
      const paymentService = new PaymentService(ctx.prisma);
      return paymentService.getPaymentByAuthority(input.authority);
    }),

  /**
   * Gets all payments for a subscription
   * 
   * This shows the payment history for a particular subscription.
   * Useful for displaying transaction history to users or in admin panels.
   * 
   * Example usage:
   * const payments = await trpc.payment.getBySubscription.query({ 
   *   subscriptionId: "sub123" 
   * });
   */
  getBySubscription: publicProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const paymentService = new PaymentService(ctx.prisma);
      return paymentService.getPaymentsBySubscription(input.subscriptionId);
    }),
});