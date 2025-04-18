// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

// ⚠️ Force Node.js runtime so crypto.createHash is available
export const runtime = 'nodejs'

/**
 * eBay does a GET to validate your URL:
 *   GET https://parts4profits.com/api/verify?challenge_code=<random>
 * You must return { "challengeResponse": "<hex>" }
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const challenge = url.searchParams.get('challenge_code')
  if (!challenge) {
    return NextResponse.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  const token = process.env.EBAY_VERIFICATION_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Server misconfigured: no EBAY_VERIFICATION_TOKEN' }, { status: 500 })
  }

  // Rebuild the exact endpoint string (protocol+host+path — no query)
  const endpoint = url.origin + url.pathname

  // Hash: challenge + verificationToken + endpoint, then hex‑digest
  const hash = createHash('sha256')
    .update(challenge)
    .update(token)
    .update(endpoint)
    .digest('hex')

  return NextResponse.json({ challengeResponse: hash })
}

/**
 * eBay will POST real deletion events here.
 * You should ACK with 200 OK and JSON body.
 */
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('🔔 eBay account deletion notification:', JSON.stringify(body, null, 2))
  // (Optional) fire off an email or whatever here

  return NextResponse.json({ received: true })
}
