import express from 'express';
import { env } from '../config/env';
import { PrismaClient } from '@prisma/client';
import { SubscriptionService } from './services/subscription/subscription.service';
import { PaymentService } from './services/payment/payment.service';
import { createSubscriptionSchema, verifyPaymentSchema, createUserSchema, createPlanSchema, createApiKeySchema, deactivateApiKeySchema } from '../utils/validators';
import { ApiKeyService } from './services/apikey/apikey.service';

/**
 * Main Server Application
 * 
 * This is the entry point of your API server. It sets up Express.js to serve
 * the tRPC API endpoints. The server handles all the HTTP routing and connects
 * your frontend to the business logic you've built.
 * 
 * The server exposes two main router groups:
 * - subscription: For managing subscriptions and plans
 * - payment: For handling payment verification
 */

export type AppRouter = never;

// Create Express application
const app = express();

// Add JSON body parsing middleware
// This allows Express to understand JSON request bodies
app.use(express.json());

// Add CORS headers to allow requests from your Next.js frontend
// In production, you'd want to restrict this to your actual domain
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

const prisma = new PrismaClient();
const apiKeyService = new ApiKeyService(prisma);

function extractKey(req: express.Request): string | undefined {
  const headerKey = (req.header('x-api-key') || '').trim();
  const auth = (req.header('authorization') || '').trim();
  const authKey = auth.startsWith('ApiKey ') ? auth.slice(7).trim() : '';
  const key = headerKey || authKey;
  return key || undefined;
}

function isMaster(key?: string): boolean {
  if (!key || !env.MASTER_API_KEY) return false;
  return key === env.MASTER_API_KEY;
}

app.use(async (req, res, next) => {
  const exempt = req.path === '/health' || req.path === '/api/payment/callback';
  if (exempt) return next();
  const key = extractKey(req);
  if (isMaster(key)) return next();
  if (!key) return res.status(401).json({ error: 'Unauthorized', message: 'Missing API key' });
  const ok = await apiKeyService.verifyAndTouch(key);
  if (!ok) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
  next();
});

/**
 * Health check endpoint
 * 
 * This simple endpoint lets you verify the server is running.
 * Useful for monitoring and deployment health checks.
 * 
 * Example: GET http://localhost:3001/health
 * Response: { status: "ok", timestamp: "2024-01-15T..." }
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'subscription-api'
  });
});

/**
 * Payment callback endpoint (for gateway redirects)
 * 
 * When a user completes payment on Zarinpal, they get redirected to this URL.
 * This endpoint extracts the parameters and redirects to your frontend with
 * the payment details so your frontend can verify and show the result.
 * 
 * In a production app, you'd set this as your callback URL in Zarinpal's dashboard.
 * For example: https://yourdomain.com/api/payment/callback
 * 
 * The gateway adds parameters like: ?Authority=xxx&Status=OK
 */
app.get('/api/payment/callback', (req, res) => {
  const { Authority, Status } = req.query;
  
  // In production, you'd redirect to your actual frontend URL
  // For example: https://yourdomain.com/payment/verify?authority=xxx&status=OK
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  res.redirect(
    `${frontendUrl}/payment/verify?authority=${Authority}&status=${Status}`
  );
});

const subscriptionService = new SubscriptionService(prisma);
const paymentService = new PaymentService(prisma);

function requireMaster(req: express.Request, res: express.Response): boolean {
  const key = extractKey(req);
  if (!isMaster(key)) {
    res.status(403).json({ error: 'Forbidden', message: 'Master API key required' });
    return false;
  }
  return true;
}

app.post('/api/apikey', async (req, res): Promise<void> => {
  if (!requireMaster(req, res)) return;
  try {
    const input = createApiKeySchema.parse(req.body);
    const created = await apiKeyService.create(input.label);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: 'Bad Request', message: err?.message || 'Invalid input' });
  }
});

app.get('/api/apikey', async (req, res): Promise<void> => {
  if (!requireMaster(req, res)) return;
  try {
    const list = await apiKeyService.list();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to list keys' });
  }
});

app.delete('/api/apikey', async (req, res): Promise<void> => {
  if (!requireMaster(req, res)) return;
  try {
    const input = deactivateApiKeySchema.parse(req.body);
    const ok = await apiKeyService.deactivate(input.id);
    if (!ok) {
      res.status(404).json({ error: 'Not Found', message: 'Key not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: 'Bad Request', message: err?.message || 'Invalid input' });
  }
});
app.post('/api/subscription', async (req, res) => {
  try {
    const input = createSubscriptionSchema.parse(req.body);
    const result = await subscriptionService.createSubscription(input);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({
      error: 'Bad Request',
      message: err?.message || 'Invalid input',
    });
  }
});

app.post('/api/payment/verify', async (req, res) => {
  try {
    const input = verifyPaymentSchema.parse(req.body);
    const payment = await paymentService.verifyPayment(input.authority, input.status);

    if (payment.status === 'COMPLETED') {
      await subscriptionService.activateSubscription(
        payment.subscriptionId,
        payment.userEmail || undefined,
        payment.userPhone || undefined
      );
    }

    res.json({
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
    });
  } catch (err: any) {
    res.status(400).json({
      error: 'Bad Request',
      message: err?.message || 'Invalid input',
    });
  }
});

app.get('/api/payment/by-authority', async (req, res) => {
  try {
    const authority = String(req.query.authority || '');
    if (!authority) {
      res.status(400).json({ error: 'Bad Request', message: 'authority is required' });
      return;
    }
    const payment = await paymentService.getPaymentByAuthority(authority);
    if (!payment) {
      res.status(404).json({ error: 'Not Found', message: 'Payment not found' });
      return;
    }
    res.json(payment);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to fetch payment' });
  }
});

app.get('/api/payment/by-subscription', async (req, res) => {
  try {
    const subscriptionId = String(req.query.subscriptionId || '');
    if (!subscriptionId) {
      res.status(400).json({ error: 'Bad Request', message: 'subscriptionId is required' });
      return;
    }
    const payments = await paymentService.getPaymentsBySubscription(subscriptionId);
    res.json(payments);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to list payments' });
  }
});

app.post('/api/user', async (req, res) => {
  try {
    const input = createUserSchema.parse(req.body);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        name: input.name,
      },
    });
    res.json(user);
  } catch (err: any) {
    res.status(400).json({
      error: 'Bad Request',
      message: err?.message || 'Invalid input',
    });
  }
});

app.post('/api/plan', async (req, res) => {
  try {
    const input = createPlanSchema.parse(req.body);
    const plan = await subscriptionService.createPlan({
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency,
      duration: input.duration,
      features: input.features,
      isActive: input.isActive,
    });
    res.json(plan);
  } catch (err: any) {
    res.status(400).json({
      error: 'Bad Request',
      message: err?.message || 'Invalid input',
    });
  }
});

/**
 * Catch-all route for undefined endpoints
 * 
 * Returns a helpful 404 message for any route that doesn't match above
 */
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist',
    availableEndpoints: {
      health: 'GET /health',
      paymentCallback: 'GET /api/payment/callback'
    }
  });
});

/**
 * Global error handler
 * 
 * Catches any unhandled errors and returns a proper JSON response
 * instead of crashing the server
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'Something went wrong',
  });
});

/**
 * Start the server
 * 
 * The server listens on the port specified in your .env file (default: 3001)
 * Once running, you can access it at http://localhost:3001
 */
const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║   🚀 Subscription API Server Running   ║
  ╠════════════════════════════════════════╣
  ║  Port: ${PORT}                            ║
  ║  Environment: ${env.NODE_ENV}              ║
  ║  API URL: ${env.API_BASE_URL}             ║
  ╠════════════════════════════════════════╣
  ║  Endpoints:                            ║
  ║  • Health: GET /health                 ║
  ║  • Callback: GET /api/payment/callback ║
  ╚════════════════════════════════════════╝
  `);
});
