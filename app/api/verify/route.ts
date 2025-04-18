import { NextRequest } from 'next/server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get('challenge_code') || '';

  const verificationToken = 'wrenchmasterparts4profitsverification';
  const endpoint = 'https://parts4profits.com/api/verify';

  const hash = crypto.createHash('sha256');
  hash.update(challengeCode);
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

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log('Received eBay Account Deletion Notification:', body);

  return new Response('OK', { status: 200 });
}
