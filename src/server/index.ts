import express from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import { createContext } from './context';
import { router } from './trpc';
import { subscriptionRouter } from './routers/subscription.router';
import { paymentRouter } from './routers/payment.router';
import { env } from '../config/env';
import { PrismaClient } from '@prisma/client';
import { SubscriptionService } from './services/subscription/subscription.service';
import { PaymentService } from './services/payment/payment.service';
import { createSubscriptionSchema, verifyPaymentSchema, createUserSchema, createPlanSchema } from '../utils/validators';

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

// Create the main tRPC app router by combining all sub-routers
// This is like the "table of contents" for your entire API
const appRouter = router({
  subscription: subscriptionRouter,
  payment: paymentRouter,
});

// Export the router type - this is what makes tRPC magical!
// Your Next.js frontend will import this type to get full type safety
export type AppRouter = typeof appRouter;

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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
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

/**
 * Mount tRPC router on /api/trpc path
 * 
 * This makes all your tRPC procedures available at:
 * POST http://localhost:3001/api/trpc/subscription.create
 * POST http://localhost:3001/api/trpc/payment.verify
 * etc.
 * 
 * The createContext function runs for every request and creates the context
 * (which includes the database connection) that's available to all procedures.
 */
app.use(
  '/api/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const prisma = new PrismaClient();
const subscriptionService = new SubscriptionService(prisma);
const paymentService = new PaymentService(prisma);

app.post('/api/rest/subscription/create', async (req, res) => {
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

app.post('/api/rest/payment/verify', async (req, res) => {
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

app.post('/api/rest/user/create', async (req, res) => {
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

app.post('/api/rest/plan/create', async (req, res) => {
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
      trpc: 'POST /api/trpc/*',
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
  ║  • tRPC: POST /api/trpc/*              ║
  ║  • Callback: GET /api/payment/callback ║
  ╚════════════════════════════════════════╝
  `);
});
