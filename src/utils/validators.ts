import { z } from 'zod';

export const verifyPaymentSchema = z.object({
  authority: z.string(),
  status: z.string().optional(),
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

export const createApiKeySchema = z.object({
  label: z.string().optional(),
});

export const deactivateApiKeySchema = z.object({
  id: z.string(),
});

export const requestOtpSchema = z.object({
  phone: z.string().min(10),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  code: z.string().min(4).max(6),
});

export const createWebhookSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(z.string()).min(1),
  secret: z.string().optional(),
});

export const updateWebhookSchema = z.object({
  id: z.string(),
  url: z.string().url().optional(),
  isActive: z.boolean().optional(),
  eventTypes: z.array(z.string()).optional(),
});
