import express from 'express';
import path from 'path';
import { env } from '../config/env';
import { PrismaClient } from '@prisma/client';
import { SubscriptionService } from './services/subscription/subscription.service';
import { PaymentService } from './services/payment/payment.service';
import { createSubscriptionSchema, verifyPaymentSchema, createUserSchema, createPlanSchema, createApiKeySchema, deactivateApiKeySchema } from '../utils/validators';
import { ApiKeyService } from './services/apikey/apikey.service';
import { AuditService } from './services/audit/audit.service';
import { AuthService } from './services/auth/auth.service';
import { WebhookService } from './services/webhook/webhook.service';
import { createWebhookSchema, updateWebhookSchema, requestOtpSchema, verifyOtpSchema } from '../utils/validators';

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

// Serve OpenAPI document for docs
app.get('/openapi.yaml', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'src/docs/openapi.yaml'));
});

// Scalar API Reference (client-side embed)
app.get('/docs', (_req, res) => {
  res.type('text/html').send(`
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dastyare Subscription API Docs</title>
    <meta name="description" content="Complete API reference with real-world examples" />
    <style>
      html, body, #app { height: 100%; margin: 0; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', {
        theme: 'purple',
        url: '/openapi.yaml',
        metaData: {
          title: 'Dastyare Subscription API Docs',
          description: 'Complete API reference with real-world examples',
        },
      });
    </script>
  </body>
</html>`);
});

const prisma = new PrismaClient();
const apiKeyService = new ApiKeyService(prisma);
const authService = new AuthService(prisma);
const webhookService = new WebhookService(prisma);
const audit = new AuditService(prisma);

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
  const exempt =
    req.path === '/health' ||
    req.path === '/api/payment/callback' ||
    req.path === '/api/auth/request-otp' ||
    req.path === '/api/auth/verify-otp' ||
    req.path === '/openapi.yaml' ||
    req.path.startsWith('/docs');
  if (exempt) return next();
  const key = extractKey(req);
  if (isMaster(key)) return next();
  if (!key) return res.status(401).json({ error: 'Unauthorized', message: 'Missing API key' });
  const result = await apiKeyService.verifyAndTouch(key);
  if (!result.ok) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
  (req as any).user = result.user || undefined;
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
    service: 'dastyare_social_subscription_api'
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
  const { Authority, Status, trackId, status } = req.query;
  const authority = (Authority as string) || (trackId as string) || '';
  const statusParam = (Status as string) || (status as string) || '';
  
  // In production, you'd redirect to your actual frontend URL
  // For example: https://yourdomain.com/payment/verify?authority=xxx&status=OK
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  res.redirect(
    `${frontendUrl}/payment/verify?authority=${authority}&status=${statusParam}`
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
    await audit.log({
      action: 'MASTER_APIKEY_CREATED',
      targetType: 'ApiKey',
      targetId: created.id,
      metadata: { label: created.label },
    });
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
    await audit.log({
      action: 'MASTER_APIKEY_DEACTIVATED',
      targetType: 'ApiKey',
      targetId: input.id,
    });
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
    const user = (req as any).user;
    const key = extractKey(req);
    if (user && payment.userId && payment.userId !== user.id && !isMaster(key)) {
      res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
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
    const user = (req as any).user;
    const key = extractKey(req);
    if (user && !isMaster(key)) {
      const filtered = payments.filter(p => p.userId === user.id);
      res.json(filtered);
      return;
    }
    res.json(payments);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to list payments' });
  }
});

app.post('/api/user', async (req, res) => {
  if (!requireMaster(req, res)) return;
  try {
    const input = createUserSchema.parse(req.body);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        name: input.name,
        role: 'USER',
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

app.get('/api/plans/available', async (_req, res) => {
  try {
    const plans = await subscriptionService.getAvailablePlans();
    res.json(plans);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to list plans' });
  }
});

app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const input = requestOtpSchema.parse(req.body);
    await authService.requestOtp(input.phone);
    res.json({ success: true });
  } catch (err: any) {
    res.status(429).json({ error: 'Too Many Requests', message: err?.message || 'Rate limited' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const input = verifyOtpSchema.parse(req.body);
    const result = await authService.verifyOtp(input.phone, input.code);
    res.json({ user: result.user, apiKey: result.apiKey });
  } catch (err: any) {
    res.status(400).json({ error: 'Bad Request', message: err?.message || 'Invalid OTP' });
  }
});

app.post('/api/me/apikey', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User API key required' });
      return;
    }
    const created = await apiKeyService.createForUser(user.id, String(req.body?.label || ''));
    await audit.log({
      userId: user.id,
      action: 'APIKEY_CREATED',
      targetType: 'ApiKey',
      targetId: created.id,
      metadata: { label: created.label },
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to create key' });
  }
});

app.post('/api/me/apikey/rotate', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User API key required' });
      return;
    }
    const id = String(req.body?.id || '');
    if (!id) {
      res.status(400).json({ error: 'Bad Request', message: 'id is required' });
      return;
    }
    const ok = await apiKeyService.deactivateForUser(id, user.id);
    if (!ok) {
      res.status(404).json({ error: 'Not Found', message: 'Key not found' });
      return;
    }
    const created = await apiKeyService.createForUser(user.id, 'rotated');
    await audit.log({
      userId: user.id,
      action: 'APIKEY_ROTATED',
      targetType: 'ApiKey',
      targetId: created.id,
      metadata: { previousId: id },
    });
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to rotate key' });
  }
});

app.delete('/api/me/apikey/:id', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User API key required' });
      return;
    }
    const id = String(req.params.id || '');
    const ok = await apiKeyService.deactivateForUser(id, user.id);
    if (!ok) {
      res.status(404).json({ error: 'Not Found', message: 'Key not found' });
      return;
    }
    await audit.log({
      userId: user.id,
      action: 'APIKEY_REVOKED',
      targetType: 'ApiKey',
      targetId: id,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to revoke key' });
  }
});

app.get('/api/me/payments', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User API key required' });
      return;
    }
    const payments = await prisma.payment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(payments);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to list payments' });
  }
});

app.get('/api/me/webhooks', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User API key required' });
      return;
    }
    const list = await webhookService.list(user.id);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to list webhooks' });
  }
});

app.post('/api/me/webhooks', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User API key required' });
      return;
    }
    const input = createWebhookSchema.parse(req.body);
    const created = await webhookService.create(user.id, input.url, input.eventTypes, input.secret);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: 'Bad Request', message: err?.message || 'Invalid input' });
  }
});

app.put('/api/me/webhooks', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User API key required' });
      return;
    }
    const input = updateWebhookSchema.parse(req.body);
    const updated = await webhookService.update(user.id, input.id, {
      url: input.url,
      isActive: input.isActive,
      eventTypes: input.eventTypes,
    });
    if (!updated) {
      res.status(404).json({ error: 'Not Found', message: 'Webhook not found' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: 'Bad Request', message: err?.message || 'Invalid input' });
  }
});

app.delete('/api/me/webhooks/:id', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User API key required' });
      return;
    }
    const id = String(req.params.id || '');
    const ok = await webhookService.remove(user.id, id);
    if (!ok) {
      res.status(404).json({ error: 'Not Found', message: 'Webhook not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Failed to delete webhook' });
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
  ║   Subscription API Server Running 
            — Dastyare Social   ║
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
