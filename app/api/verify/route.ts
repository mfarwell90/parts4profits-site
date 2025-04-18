// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';

// 1) eBay sends a GET during subscription setup with ?hub.challenge=xxx
export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('hub.challenge') || '';
  // reply with the raw challenge text
  return new NextResponse(challenge, { status: 200 });
}

// 2) eBay will POST actual “account deletion” events here later
export async function POST(req: NextRequest) {
  // you could verify req.json().verificationToken if you like…
  // for now just return 200 so eBay knows you got it
  return NextResponse.json({ acknowledged: true });
}
