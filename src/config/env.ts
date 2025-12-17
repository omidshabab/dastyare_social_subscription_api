import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string(),
  API_BASE_URL: z.string().default('http://localhost:3001'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  APP_NAME: z.string().default('Subscription API'),
  NODE_ENV: z.string().default('development'),
  MASTER_API_KEY: z.string().optional(),
  ZARINPAL: z.object({
    MERCHANT_ID: z.string().default('zarinpal-merchant-id'),
    SANDBOX: z.boolean().default(true),
    REQUEST_URL: z.string().default('https://sandbox.zarinpal.com/pg/v4/payment/request.json'),
    VERIFY_URL: z.string().default('https://sandbox.zarinpal.com/pg/v4/payment/verify.json'),
    GATEWAY_URL: z.string().default('https://sandbox.zarinpal.com/pg/StartPay/'),
  }),
  SMS: z.object({
    API_KEY: z.string().optional(),
    SENDER: z.string().optional(),
  }),
  EMAIL: z.object({
    HOST: z.string().optional(),
    PORT: z.coerce.number().optional(),
    USER: z.string().optional(),
    PASS: z.string().optional(),
    FROM: z.string().optional(),
  }),
});

const parsedEnv = {
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  API_BASE_URL: process.env.API_BASE_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
  APP_NAME: process.env.APP_NAME,
  NODE_ENV: process.env.NODE_ENV,
  MASTER_API_KEY: process.env.MASTER_API_KEY,
  ZARINPAL: {
    MERCHANT_ID: process.env.ZARINPAL_MERCHANT_ID,
    SANDBOX: process.env.ZARINPAL_SANDBOX === 'true',
    REQUEST_URL: process.env.ZARINPAL_REQUEST_URL,
    VERIFY_URL: process.env.ZARINPAL_VERIFY_URL,
    GATEWAY_URL: process.env.ZARINPAL_GATEWAY_URL,
  },
  SMS: {
    API_KEY: process.env.SMS_API_KEY,
    SENDER: process.env.SMS_SENDER,
  },
  EMAIL: {
    HOST: process.env.SMTP_HOST,
    PORT: process.env.SMTP_PORT,
    USER: process.env.SMTP_USER,
    PASS: process.env.SMTP_PASS,
    FROM: process.env.SMTP_FROM,
  },
};

export const env = envSchema.parse(parsedEnv);
