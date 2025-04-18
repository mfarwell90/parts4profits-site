// File: app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

// run under Node so crypto.createHash is available
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // 1) grab the random code eBay sent us
  const url = new URL(request.url)
  const challenge = url.searchParams.get('challenge_code')
  if (!challenge) {
    return NextResponse.json(
      { error: 'Missing challenge_code' },
      { status: 400 }
    )
  }

  // 2) load your secret and re‑build the exact URL eBay called
  const token = process.env.EBAY_VERIFICATION_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'Server misconfiguration: no EBAY_VERIFICATION_TOKEN' },
      { status: 500 }
    )
  }
  const endpoint = url.origin + url.pathname

  // 3) hash in the required order: challenge + token + endpoint
  const hash = createHash('sha256')
    .update(challenge)
    .update(token)
    .update(endpoint)
    .digest('hex')

  // 4) reply with exactly this shape
  return NextResponse.json({ challengeResponse: hash })
}

export async function POST(request: NextRequest) {
  // eBay will POST you JSON on real deletions
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // log it (or do whatever you want)
  console.log('🗑️  eBay deletion payload:', JSON.stringify(payload, null, 2))

  // ack back a 200
  return NextResponse.json({ received: true })
}
