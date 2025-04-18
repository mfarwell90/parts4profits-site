// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

// 1) Force this file to run under Node.js (so crypto.createHash works)
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const challenge = url.searchParams.get('challenge_code')
  if (!challenge) {
    return NextResponse.json(
      { error: 'Missing challenge_code' },
      { status: 400 }
    )
  }

  const token = process.env.EBAY_VERIFICATION_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'Server misconfiguration: no EBAY_VERIFICATION_TOKEN' },
      { status: 500 }
    )
  }

  // 2) Re‑construct the exact endpoint eBay called (origin + path, no query)
  const endpoint = url.origin + url.pathname

  // 3) Hash in the order eBay demands: challenge + verificationToken + endpoint
  const challengeResponse = createHash('sha256')
    .update(challenge)
    .update(token)
    .update(endpoint)
    .digest('hex')

  // 4) Reply with exactly this JSON shape
  return NextResponse.json({ challengeResponse })
}

export async function POST(request: NextRequest) {
  // eBay will POST real deletion events here
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('📬 eBay deletion payload:', JSON.stringify(body, null, 2))

  // ACK with a 200 so eBay knows you got it
  return NextResponse.json({ received: true })
}
