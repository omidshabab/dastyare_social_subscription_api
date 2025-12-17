import { router, publicProcedure } from '../trpc';
import { SubscriptionService } from '../services/subscription/subscription.service';
import { createSubscriptionSchema } from '../../utils/validators';

export const subscriptionRouter = router({
  create: publicProcedure
    .input(createSubscriptionSchema)
    .mutation(async ({ ctx, input }) => {
      const subscriptionService = new SubscriptionService(ctx.prisma);
      return subscriptionService.createSubscription(input);
    }),
});
