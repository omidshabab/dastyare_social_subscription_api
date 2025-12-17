import { z } from 'zod';

export const verifyPaymentSchema = z.object({
  authority: z.string(),
  status: z.string(),
});

export const createSubscriptionSchema = z.object({
  userId: z.string(),
  planId: z.string(),
  autoRenew: z.boolean().optional(),
  gateway: z.string().optional(),
  userEmail: z.string().email().optional(),
  userPhone: z.string().optional(),
});

export const createUserSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  name: z.string().optional(),
});

export const createPlanSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  price: z.number().int(),
  currency: z.string().optional(),
  duration: z.number().int(),
  features: z.string().optional(),
  isActive: z.boolean().optional(),
});
