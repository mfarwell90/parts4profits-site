import { NextRequest } from 'next/server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get('challenge_code') || '';
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN || '';
  const endpoint = 'https://parts4profits.com/api/ebay/account-deletion'; // Must match EXACTLY

  const combined = challengeCode + verificationToken + endpoint;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');

  return new Response(hash, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log('Received eBay Account Deletion Notification:', body);

  return new Response('OK', { status: 200 });
}
