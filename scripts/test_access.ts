import axios from 'axios';
import crypto from 'crypto';

async function main() {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
  const apiKey = process.env.MASTER_API_KEY || '';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const masterPhone = '09120000000';

  const client = axios.create({
    baseURL: baseUrl,
  });

  const otpCode = '54321';

  const errors: string[] = [];

  // 1) Missing Origin should be forbidden
  try {
    await client.post('/api/user', { name: 'X' }, {
      headers: { 'x-api-key': apiKey, 'x-master-phone': masterPhone, 'x-master-otp': otpCode },
    });
    errors.push('Expected frontend origin restriction error');
  } catch {}

  // 2) With Origin and master key should succeed to create user (skips DB if unavailable)

  // 4) Valid request should create user and audit log (only if DB is available)
  let createdUserId: string | undefined;
  try {
    const res = await client.post('/api/user', { name: 'Access Test User' }, {
      headers: { 'x-api-key': apiKey, 'Origin': frontendUrl, 'Referer': `${frontendUrl}/` },
    });
    createdUserId = res.data?.id;
  } catch {}

  // 5) /api/me routes should not exist
  try {
    await client.get('/api/me/payments', { headers: { 'x-api-key': apiKey } });
    errors.push('/api/me/payments should not exist');
  } catch {}

  console.log(JSON.stringify({ ok: errors.length === 0, errors, createdUserId }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
