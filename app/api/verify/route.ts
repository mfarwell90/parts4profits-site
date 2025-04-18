import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('challenge_code')!
  const token     = process.env.EBAY_VERIFICATION_TOKEN!
  const endpoint  = 'https://parts4profits.com/api/verify'

  const hash = createHash('sha256')
  hash.update(challenge)
  hash.update(token)
  hash.update(endpoint)

  return NextResponse.json({ challengeResponse: hash.digest('hex') })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  console.log('🔔 Account‑deletion notification:', body)
  // …your email‑alert or logging logic…
  return NextResponse.json({ status: 'received' })
}
