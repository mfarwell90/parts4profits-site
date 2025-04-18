import { NextRequest } from 'next/server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get('challenge_code') || '';

  // Hardcoded verification token
  const verificationToken = 'wrenchmasterparts4profitsverification';

  // Must match EXACTLY what you gave eBay (no slash at the end!)
  const endpoint = 'https://parts4profits.com/api/verify';

  const combined = challengeCode + verificationToken + endpoint;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');

  return new Response(JSON.stringify({ challengeResponse: hash }), {
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
