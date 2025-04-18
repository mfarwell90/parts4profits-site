import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export const runtime = 'nodejs'

const EBAY_VERIFICATION_TOKEN = 'wrenchmasterparts4profitsverification'
const VERIFY_ENDPOINT = 'https://parts4profits.com/api/verify'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const challenge = url.searchParams.get('challenge_code')
  if (!challenge) {
    return new NextResponse(
      JSON.stringify({ error: 'Missing challenge_code' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    )
  }

  // hash in the exact order eBay wants:
  //   challengeCode + verificationToken + endpointURL
  const endpoint = url.origin + url.pathname
  const hash = createHash('sha256')
    .update(challenge)
    .update(EBAY_VERIFICATION_TOKEN)
    .update(endpoint)
    .digest('hex')

  return new NextResponse(
    JSON.stringify({ challengeResponse: hash }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

export async function POST(req: NextRequest) {
  // handle real deletion notifications here
  const body = await req.json()
  console.log('🔔 eBay deletion notice:', body)
  return NextResponse.json({ received: true })
}
