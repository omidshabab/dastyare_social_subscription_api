# Dastyare Social Subscription API

An Express + tRPC server that manages subscription plans, payments (Zarinpal gateway supported), and notifications. This README explains how to install, configure, run, and call every route with example `curl` commands.

## Contents
- Overview
- Prerequisites
- Environment
- Database
- Run
- API Overview
- Health
- Payment Callback
- tRPC Endpoints
  - `subscription.create`
  - `payment.verify`
  - `payment.getByAuthority`
  - `payment.getBySubscription`
- Typical Flow
- Error Responses

## Overview
- Server: Express (`/health`, `/api/payment/callback`, `/api/trpc/*`, `/api/rest/*`)
- API style: tRPC v10 over HTTP mounted at `/api/trpc`
- REST helpers: Plain JSON endpoints under `/api/rest/*` for easy testing
- DB: Prisma with PostgreSQL (`provider = "postgresql"`)
- Payment Gateway: Zarinpal (sandbox-ready), extensible gateway factory

## Prerequisites
- Node.js 18+ (recommended 20+)
- npm
- SQLite (bundled; no external service needed)

## Environment
Create `.env` in the project root. Example:
```
PORT=3001
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:6543/subscriptions"
API_BASE_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3000"
APP_NAME="Subscription API"
NODE_ENV="development"

# Zarinpal (sandbox defaults are already baked in)
ZARINPAL_MERCHANT_ID="your-merchant-id"
ZARINPAL_SANDBOX=true
# Optional overrides (defaults point to sandbox endpoints)
ZARINPAL_REQUEST_URL="https://sandbox.zarinpal.com/pg/v4/payment/request.json"
ZARINPAL_VERIFY_URL="https://sandbox.zarinpal.com/pg/v4/payment/verify.json"
ZARINPAL_GATEWAY_URL="https://sandbox.zarinpal.com/pg/StartPay/"

# Optional notifications
SMS_API_KEY=""
SMS_SENDER=""
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
```

## Database
- Initialize schema: `npm run db:push`
- (Optional) Prisma Studio: `npm run db:studio` to create `Plan` and `User` records interactively
- Ensure PostgreSQL is running and `DATABASE_URL` points to a reachable instance

Model highlights:
- `Plan`: `name`, `price`, `currency` (default `IRR`), `duration` (days), `isActive`
- `Subscription`: `userId`, `planId`, `status` (`PENDING`, `ACTIVE`, `EXPIRED`, `CANCELLED`), `autoRenew`, `startDate`, `endDate`
- `Payment`: `subscriptionId`, `amount`, `currency`, `gateway`, `authority`, `paymentUrl`, `status` (`PENDING`, `COMPLETED`, `FAILED`)

## Run
- Dev: `npm run dev` (nodemon + ts-node)
- Build: `npm run build`
- Start: `npm start`
- Default base URL: `http://localhost:3001`

## API Overview
- Health: `GET /health`
- Payment callback (redirects to frontend): `GET /api/payment/callback`
- tRPC procedures (HTTP): `POST /api/trpc/<router.procedure>`
  - `subscription.create`
  - `payment.verify`
  - `payment.getByAuthority`
  - `payment.getBySubscription`
- REST test endpoints (plain JSON):
  - `POST /api/rest/subscription/create`
  - `POST /api/rest/payment/verify`
  - `POST /api/rest/user/create`
  - `POST /api/rest/plan/create`

Request format for tRPC HTTP:
- Endpoint: `POST /api/trpc/<procedure>`
- Headers: `Content-Type: application/json`
- Body: `{"input": { ... } }`
- Note: Some HTTP clients may require tRPC’s batch format. If you prefer simpler testing, use the REST helper endpoints shown below.

## Health
- Endpoint: `GET /health`
- Example:
```bash
curl -s http://localhost:3001/health
```
- Response (example):
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:34:56.000Z",
  "service": "subscription-api"
}
```

## Payment Callback
- Endpoint: `GET /api/payment/callback?Authority=<AUTH>&Status=<OK|NOK>`
- Behavior: Redirects to `FRONTEND_URL` with `authority` and `status` query params so your frontend can call `payment.verify`.
- Example:
```bash
curl -i "http://localhost:3001/api/payment/callback?Authority=A00000000000000000000000000123456&Status=OK"
```
- Response: `302` redirect to `http://localhost:3000/payment/verify?authority=...&status=...`

## tRPC Endpoints

### subscription.create
- Purpose: Create a new subscription and initiate payment; returns payment link.
- Endpoint: `POST /api/trpc/subscription.create`
- Input:
```json
{
  "input": {
    "userId": "user_cuid",
    "planId": "plan_cuid",
    "autoRenew": true,
    "gateway": "zarinpal",
    "userEmail": "user@example.com",
    "userPhone": "09120000000"
  }
}
```
- Example:
```bash
curl -sX POST http://localhost:3001/api/trpc/subscription.create \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "userId": "user_cuid",
      "planId": "plan_cuid",
      "autoRenew": true,
      "gateway": "mock",
      "userEmail": "user@example.com",
      "userPhone": "09120000000"
    }
  }'
```
- Success response (example):
```json
{
  "subscription": {
    "id": "sub_cuid",
    "userId": "user_cuid",
    "planId": "plan_cuid",
    "status": "PENDING",
    "autoRenew": true,
    "createdAt": "2024-01-15T12:34:56.000Z",
    "updatedAt": "2024-01-15T12:34:56.000Z",
    "plan": {
      "id": "plan_cuid",
      "name": "Monthly",
      "price": 100000,
      "currency": "IRR",
      "duration": 30
    }
  },
  "payment": {
    "id": "pay_cuid",
    "amount": 100000,
    "currency": "IRR",
    "paymentUrl": "https://sandbox.zarinpal.com/pg/StartPay/A000...",
    "authority": "A00000000000000000000000000123456",
    "status": "PENDING"
  }
}
```

### payment.verify
- Purpose: Verify a payment after the user returns from the gateway; activates the subscription when successful.
- Endpoint: `POST /api/trpc/payment.verify`
- Input:
```json
{
  "input": {
    "authority": "A00000000000000000000000000123456",
    "status": "OK"
  }
}
```
- Example:
```bash
curl -sX POST http://localhost:3001/api/trpc/payment.verify \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "authority": "A00000000000000000000000000123456",
      "status": "OK"
    }
  }'
```
- Success response (example):
```json
{
  "success": true,
  "payment": {
    "id": "pay_cuid",
    "amount": 100000,
    "currency": "IRR",
    "status": "COMPLETED",
    "paidAt": "2024-01-15T12:40:00.000Z",
    "gatewayTxId": "1234567890"
  },
  "subscriptionId": "sub_cuid"
}
```
- Failure response (example):
```json
{
  "error": "Internal server error",
  "message": "Payment verification failed"
}
```

### payment.getByAuthority
- Purpose: Fetch a payment by its gateway authority code.
- Endpoint: `POST /api/trpc/payment.getByAuthority`
- Input:
```json
{ "input": { "authority": "A00000000000000000000000000123456" } }
```
- Example:
```bash
curl -sX POST http://localhost:3001/api/trpc/payment.getByAuthority \
  -H "Content-Type: application/json" \
  -d '{ "input": { "authority": "A00000000000000000000000000123456" } }'
```
- Response (example):
```json
{
  "id": "pay_cuid",
  "subscriptionId": "sub_cuid",
  "amount": 100000,
  "currency": "IRR",
  "gateway": "zarinpal",
  "authority": "A00000000000000000000000000123456",
  "paymentUrl": "https://sandbox.zarinpal.com/pg/StartPay/A000...",
  "status": "COMPLETED",
  "verifiedAt": "2024-01-15T12:40:00.000Z",
  "subscription": {
    "id": "sub_cuid",
    "plan": {
      "id": "plan_cuid",
      "name": "Monthly",
      "price": 100000,
      "currency": "IRR",
      "duration": 30
    }
  }
}
```

### payment.getBySubscription
- Purpose: List payments for a subscription.
- Endpoint: `POST /api/trpc/payment.getBySubscription`
- Input:
```json
{ "input": { "subscriptionId": "sub_cuid" } }
```
- Example:
```bash
curl -sX POST http://localhost:3001/api/trpc/payment.getBySubscription \
  -H "Content-Type: application/json" \
  -d '{ "input": { "subscriptionId": "sub_cuid" } }'
```
- Response (example):
```json
[
  {
    "id": "pay_cuid",
    "amount": 100000,
    "currency": "IRR",
    "gateway": "zarinpal",
    "authority": "A00000000000000000000000000123456",
    "status": "COMPLETED",
    "verifiedAt": "2024-01-15T12:40:00.000Z",
    "createdAt": "2024-01-15T12:34:56.000Z"
  }
]
```

## Typical Flow
1. Create `Plan` and `User` in DB (Prisma Studio).
2. Call `subscription.create` with `userId` + `planId`; receive `paymentUrl`.
3. Redirect user to `paymentUrl` (Zarinpal).
4. After payment, Zarinpal redirects to `/api/payment/callback?Authority=...&Status=OK`, which redirects to your `FRONTEND_URL`.
5. Frontend calls `payment.verify` using `authority` + `status`; subscription becomes `ACTIVE` on success.

## Error Responses
- Express global handler returns JSON like:
```json
{
  "error": "Internal server error",
  "message": "Human-readable error message"
}
```
- Common statuses:
  - `400` validation (e.g., unsupported gateway)
  - `404` not found (e.g., subscription/payment missing)
  - `502` payment gateway errors

## Code Map
- Core server: `src/server/index.ts`
- tRPC setup: `src/server/trpc.ts`
- Context (Prisma): `src/server/context.ts`
- Routers:
  - Subscription: `src/server/routers/subscription.router.ts`
  - Payment: `src/server/routers/payment.router.ts`
- Services:
  - Subscription: `src/server/services/subscription/subscription.service.ts`
  - Payment: `src/server/services/payment/payment.service.ts`
  - Gateways: `src/server/services/payment/gateways/*.ts`
- Types & validators:
  - Enums: `src/types/enums.ts`
  - Payment types: `src/types/payment.types.ts`
  - Subscription types: `src/types/subscription.types.ts`
  - Zod validators: `src/utils/validators.ts`

## REST Test Endpoints
These endpoints accept plain JSON without tRPC batching and are ideal for quick manual testing.

### POST /api/rest/subscription/create
- Input:
```json
{
  "userId": "user_cuid",
  "planId": "plan_cuid",
  "autoRenew": true,
  "gateway": "mock",
  "userEmail": "user@example.com",
  "userPhone": "09120000000"
}
```
- Example:
```bash
curl -sX POST http://localhost:3001/api/rest/subscription/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_cuid",
    "planId": "plan_cuid",
    "autoRenew": true,
    "gateway": "mock",
    "userEmail": "user@example.com",
    "userPhone": "09120000000"
  }'
```

### POST /api/rest/payment/verify
- Input:
```json
{ "authority": "A00000000000000000000000000123456", "status": "OK" }
```
- Example:
```bash
curl -sX POST http://localhost:3001/api/rest/payment/verify \
  -H "Content-Type: application/json" \
  -d '{ "authority": "A00000000000000000000000000123456", "status": "OK" }'
```

## Test Run
- Quick health test script: already added in `package.json`:
```json
{
  "scripts": {
    "test:api": "curl -sSf http://localhost:3001/health >/dev/null && echo \"Health OK\" || (echo \"Health FAILED\" && exit 1)"
  }
}
```
- Run: `npm run test:api` (ensure the server is running)
- Full E2E smoke (creates user, plan, subscription with mock gateway, verifies payment, and tests tRPC routes):
  - `npm run test:smoke`
