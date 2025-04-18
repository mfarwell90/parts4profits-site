// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

// ⚠️ Make sure you have set EBAY_VERIFICATION_TOKEN in Vercel (or .env)
const VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN!
if (!VERIFICATION_TOKEN) {
  throw new Error('Missing EBAY_VERIFICATION_TOKEN env var')
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const challengeCode = url.searchParams.get('challenge_code')
  if (!challengeCode) {
    return NextResponse.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  // Build the full callback URL exactly as eBay sees it
  const endpoint = `${url.origin}${url.pathname}`

  // Hash in the required order
  const hash = createHash('sha256')
    .update(challengeCode)
    .update(VERIFICATION_TOKEN)
    .update(endpoint)
  const challengeResponse = hash.digest('hex')

  return NextResponse.json(
    { challengeResponse },
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }
  )
}

export async function POST(req: NextRequest) {
  // You can log or process the deletion notification here
  const body = await req.json().catch(() => ({}))
  console.log('🔔 eBay deletion notification:', JSON.stringify(body, null, 2))

  // A 200 OK tells eBay you’ve received it
  return NextResponse.json({ received: true }, { status: 200 })
}
