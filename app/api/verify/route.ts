// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

// run under Node so crypto.createHash is available
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const challenge = url.searchParams.get('challenge_code')
  if (!challenge) {
    return NextResponse.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  const token = process.env.EBAY_VERIFICATION_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'Server misconfigured: no EBAY_VERIFICATION_TOKEN' },
      { status: 500 }
    )
  }

  // Reconstruct exactly https://<host>/api/verify
  const endpoint = url.origin + url.pathname

  // Hash in order: challenge + token + endpoint
  const challengeResponse = createHash('sha256')
    .update(challenge)
    .update(token)
    .update(endpoint)
    .digest('hex')

  return NextResponse.json({ challengeResponse })
}

export async function POST(req: NextRequest) {
  // eBay will send you a JSON body here
  const payload = await req.json()
  console.log('🔔 eBay account deletion notification:', JSON.stringify(payload, null, 2))

  // just ACK it
  return NextResponse.json({ received: true })
}
