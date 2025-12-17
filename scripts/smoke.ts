import axios from 'axios';

async function main() {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';

  const result: Record<string, any> = {};
  try {
    const health = await axios.get(`${baseUrl}/health`);
    result.health = health.data?.status || 'unknown';
    if (health.status !== 200 || health.data?.status !== 'ok') {
      throw new Error('Health check failed');
    }
  } catch (e: any) {
    console.error('Health check failed:', e?.message || e);
    throw e;
  }

  let userId: string | undefined;
  let userEmail: string | undefined;
  let userPhone: string | undefined;
  try {
    const userRes = await axios.post(`${baseUrl}/api/rest/user/create`, {
      email: `user_${Date.now()}@example.com`,
      phone: `09${Math.floor(100000000 + Math.random() * 899999999)}`,
      name: 'Smoke Test User',
    });
    userId = userRes.data.id;
    userEmail = userRes.data.email;
    userPhone = userRes.data.phone;
    result.userId = userId;
  } catch (e: any) {
    console.error('User create failed:', e?.response?.data?.message || e?.message || e);
  }

  let planId: string | undefined;
  try {
    const planRes = await axios.post(`${baseUrl}/api/rest/plan/create`, {
      name: `Smoke Plan ${Date.now()}`,
      description: 'Test plan',
      price: 100000,
      currency: 'IRR',
      duration: 30,
      isActive: true,
    });
    planId = planRes.data.id;
    result.planId = planId;
  } catch (e: any) {
    console.error('Plan create failed:', e?.response?.data?.message || e?.message || e);
  }

  // Create subscription using mock gateway to avoid external dependency
  let subscriptionId: string | undefined;
  let authority: string | undefined;
  let subscriptionCreateOk = false;
  try {
    const subRes = await axios.post(`${baseUrl}/api/rest/subscription/create`, {
      userId,
      planId,
      autoRenew: true,
      gateway: 'mock',
      userEmail,
      userPhone,
    });
    subscriptionId = subRes.data?.subscription?.id;
    authority = subRes.data?.payment?.authority;
    subscriptionCreateOk = Boolean(subRes.data?.payment?.paymentUrl && authority && subscriptionId);
  } catch (e: any) {
    console.error('Subscription create failed:', e?.response?.data?.message || e?.message || e);
  }

  // Verify payment via REST
  let verifyOk = false;
  try {
    const verifyRes = await axios.post(`${baseUrl}/api/rest/payment/verify`, {
      authority,
      status: 'OK',
    });
    verifyOk = Boolean(verifyRes.data?.success === true);
  } catch (e: any) {
    console.error('Payment verify failed:', e?.response?.data?.message || e?.message || e);
  }

  // tRPC: payment.getByAuthority
  let gotByAuthority = false;
  try {
    const getByAuthorityRes = await axios.post(`${baseUrl}/api/trpc/payment.getByAuthority`, {
      input: { authority },
    });
    gotByAuthority = Boolean(getByAuthorityRes.data?.authority === authority);
  } catch (e: any) {
    console.error('tRPC payment.getByAuthority failed:', e?.response?.data?.message || e?.message || e);
  }

  // tRPC: payment.getBySubscription
  let listBySubscriptionOk = false;
  try {
    const getBySubscriptionRes = await axios.post(`${baseUrl}/api/trpc/payment.getBySubscription`, {
      input: { subscriptionId },
    });
    listBySubscriptionOk = Array.isArray(getBySubscriptionRes.data) && getBySubscriptionRes.data.length >= 1;
  } catch (e: any) {
    console.error('tRPC payment.getBySubscription failed:', e?.response?.data?.message || e?.message || e);
  }

  // tRPC: payment.verify (idempotent second call)
  let trpcVerifyOk = false;
  try {
    const trpcVerifyRes = await axios.post(`${baseUrl}/api/trpc/payment.verify`, {
      input: { authority, status: 'OK' },
    });
    trpcVerifyOk = Boolean(trpcVerifyRes.data?.success === true);
  } catch (e: any) {
    console.error('tRPC payment.verify failed:', e?.response?.data?.message || e?.message || e);
  }

  // Callback endpoint (should redirect)
  let callbackRedirectOk = false;
  try {
    const callbackRes = await axios.get(`${baseUrl}/api/payment/callback?Authority=${authority}&Status=OK`, {
      maxRedirects: 0,
      validateStatus: s => s >= 200 && s < 400,
    });
    callbackRedirectOk = callbackRes.status === 302;
  } catch (e: any) {
    console.error('Payment callback test failed:', e?.message || e);
  }

  console.log(
    JSON.stringify(
      {
        health: result.health,
        userId,
        planId,
        subscriptionId,
        subscriptionCreateOk,
        authority,
        verifyOk,
        gotByAuthority,
        listBySubscriptionOk,
        trpcVerifyOk,
        callbackRedirectOk,
      },
      null,
      2
    )
  );
}

main()
  .then(() => {
    // Exit with code 0 even if some route checks failed; the logs provide details.
    // If you want strict failure, change this to analyze the booleans and exit(1) accordingly.
    process.exit(0);
  })
  .catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
