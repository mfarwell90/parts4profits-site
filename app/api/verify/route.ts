// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

// we need Node's crypto module
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const challenge = url.searchParams.get('challenge_code')
  if (!challenge) {
    return new NextResponse(
      JSON.stringify({ error: 'Missing challenge_code' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    )
  }

  const token = process.env.EBAY_VERIFICATION_TOKEN
  if (!token) {
    return new NextResponse(
      JSON.stringify({ error: 'Server misconfigured: no EBAY_VERIFICATION_TOKEN' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    )
  }

  // eBay requires hashing in this exact order:
  //   challengeCode + verificationToken + endpointURL
  const endpoint = url.origin + url.pathname // e.g. https://parts4profits.com/api/verify
  const hash = createHash('sha256')
    .update(challenge)
    .update(token)
    .update(endpoint)
    .digest('hex')

  return new NextResponse(
    JSON.stringify({ challengeResponse: hash }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

export async function POST(req: NextRequest) {
  // when actual deletion notifications arrive, eBay will POST JSON here
  const body = await req.json()
  console.log('🔔 eBay deletion notice:', body)
  return NextResponse.json({ received: true })
}
