// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export const runtime = 'nodejs'  // make sure we get Node’s crypto

export async function GET(request: NextRequest) {
  // 1) grab the challenge_code
  const url = new URL(request.url)
  const challengeCode = url.searchParams.get('challenge_code')
  if (!challengeCode) {
    return NextResponse.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  // 2) load your verification token & endpoint URL
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN
  const endpointUrl = 'https://parts4profits.com/api/verify'

  // 3) sha‑256( challengeCode + verificationToken + endpointUrl )
  const hash = createHash('sha256')
  hash.update(challengeCode)
  hash.update(verificationToken!)
  hash.update(endpointUrl)
  const challengeResponse = hash.digest('hex')

  // 4) return { challengeResponse } JSON
  return NextResponse.json({ challengeResponse })
}

export async function POST(request: NextRequest) {
  // eBay will POST the actual deletion payload here.
  // You can log it if you like, but must return 200 OK.
  return NextResponse.json({}, { status: 200 })
}
