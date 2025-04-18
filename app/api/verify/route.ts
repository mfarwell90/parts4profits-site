import crypto from 'crypto';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url); // ← this is what actually works
  const challengeCode = searchParams.get('challenge_code') || '';

  const verificationToken = 'wrenchmasterparts4profitsverification';
  const endpoint = 'https://parts4profits.com/api/verify';

  const hash = crypto.createHash('sha256');
  hash.update(challengeCode);                     // ← separate .update() calls
  hash.update(verificationToken);
  hash.update(endpoint);
  const challengeResponse = hash.digest('hex');

  return new Response(JSON.stringify({ challengeResponse }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  console.log('Received eBay Account Deletion Notification:', body);

  return new Response('OK', { status: 200 });
}
