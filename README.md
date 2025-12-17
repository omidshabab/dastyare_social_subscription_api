# Dastyare Social Subscription API

Express REST API for subscription plans, payments (Zarinpal + mock gateway), notifications, and API key management.

## Overview
- Server: Express REST (`/health`, `/api/payment/callback`, `/api/*`)
- DB: Prisma + PostgreSQL
- Gateways: Zarinpal (sandbox-ready) and `mock` for testing

## Project Structure
```
.
├─ prisma/
│  ├─ migrations/
│  └─ schema.prisma
├─ scripts/
│  ├─ prisma_test.js
│  └─ smoke.ts
├─ src/
│  ├─ config/
│  │  └─ env.ts
│  ├─ server/
│  │  ├─ services/
│  │  │  ├─ apikey/
│  │  │  │  └─ apikey.service.ts
│  │  │  ├─ notification/
│  │  │  │  ├─ email.service.ts
│  │  │  │  ├─ notification.service.ts
│  │  │  │  └─ sms.service.ts
│  │  │  ├─ payment/
│  │  │  │  ├─ gateways/
│  │  │  │  │  ├─ base.gateway.ts
│  │  │  │  │  ├─ index.ts
│  │  │  │  │  ├─ mock.gateway.ts
│  │  │  │  │  └─ zarinpal.gateway.ts
│  │  │  │  └─ payment.service.ts
│  │  │  └─ subscription/
│  │  │     └─ subscription.service.ts
│  │  └─ index.ts
│  ├─ types/
│  │  ├─ enums.ts
│  │  ├─ payment.types.ts
│  │  └─ subscription.types.ts
│  └─ utils/
│     ├─ errors.ts
│     └─ validators.ts
├─ .env.example
├─ README.md
├─ package.json
└─ tsconfig.json
```

## Environment
Create `.env` in the project root:
```
PORT=3001
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:6543/subscriptions"
API_BASE_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3000"
APP_NAME="Subscription API"
NODE_ENV="development"
MASTER_API_KEY="master123"

# Zarinpal
ZARINPAL_MERCHANT_ID="your-merchant-id"
ZARINPAL_SANDBOX=true
```

## Run
- Dev: `npm run dev`
- Build: `npm run build`
- Start: `npm start`
- Base URL: `http://localhost:3001`

## Authentication
- Provide an API key via `x-api-key: <key>` header.
- Master endpoints require `MASTER_API_KEY`.
- Middleware exempts `GET /health` and `GET /api/payment/callback`.

## Routes

### Health
```bash
curl -s http://localhost:3001/health
```

### Payment Callback (redirect)
```bash
curl -i "http://localhost:3001/api/payment/callback?Authority=A000...&Status=OK"
```

### API Keys (master-only)
- Create
```bash
curl -sX POST http://localhost:3001/api/apikey \
  -H "Content-Type: application/json" \
  -H "x-api-key: master123" \
  -d '{ "label": "mobile-app" }'
```
- List
```bash
curl -s http://localhost:3001/api/apikey \
  -H "x-api-key: master123"
```
- Deactivate
```bash
curl -sX DELETE http://localhost:3001/api/apikey \
  -H "Content-Type: application/json" \
  -H "x-api-key: master123" \
  -d '{ "id": "api_key_id" }'
```

### Users
```bash
curl -sX POST http://localhost:3001/api/user \
  -H "Content-Type: application/json" \
  -H "x-api-key: master123" \
  -d '{
    "email": "user@example.com",
    "phone": "09120000000",
    "name": "Test User"
  }'
```

### Plans
```bash
curl -sX POST http://localhost:3001/api/plan \
  -H "Content-Type: application/json" \
  -H "x-api-key: master123" \
  -d '{
    "name": "Monthly",
    "description": "Test plan",
    "price": 100000,
    "currency": "IRR",
    "duration": 30,
    "isActive": true
  }'
```

### Subscriptions
- Create with mock gateway
```bash
curl -sX POST http://localhost:3001/api/subscription \
  -H "Content-Type: application/json" \
  -H "x-api-key: master123" \
  -d '{
    "userId": "user_cuid",
    "planId": "plan_cuid",
    "autoRenew": true,
    "gateway": "mock",
    "userEmail": "user@example.com",
    "userPhone": "09120000000"
  }'
```

### Payments
- Verify
```bash
curl -sX POST http://localhost:3001/api/payment/verify \
  -H "Content-Type: application/json" \
  -H "x-api-key: master123" \
  -d '{ "authority": "AUTH-123", "status": "OK" }'
```
- Get by authority
```bash
curl -s "http://localhost:3001/api/payment/by-authority?authority=AUTH-123" \
  -H "x-api-key: master123"
```
- List by subscription
```bash
curl -s "http://localhost:3001/api/payment/by-subscription?subscriptionId=sub_123" \
  -H "x-api-key: master123"
```

## Typical Flow
- Create `User` and `Plan`.
- Create `Subscription` with `gateway=mock` to receive a payment link and `authority`.
- After user “pays”, call `POST /api/payment/verify` with `authority` and `status=OK`.
- Subscription becomes `ACTIVE` and notifications are sent.

## Testing
- Health: `npm run test:api`
- Smoke (REST-only): `MASTER_API_KEY=master123 npm run test:smoke`
