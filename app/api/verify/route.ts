// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

// IMPORTANT: this must exactly match the URL you give eBay!
const ENDPOINT_URL = 'https://parts4profits.com/api/verify'

export const runtime = 'nodejs'  // we need Node crypto

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const challengeCode = searchParams.get('challenge_code')
  if (!challengeCode) {
    // we only care about real eBay calls which always include `?challenge_code=…`
    return NextResponse.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN
  if (!verificationToken) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  // hash: challengeCode + verificationToken + endpoint
  const hash = createHash('sha256')
    .update(challengeCode)
    .update(verificationToken)
    .update(ENDPOINT_URL)

  return NextResponse.json({ challengeResponse: hash.digest('hex') })
}

export async function POST(req: NextRequest) {
  // real eBay POSTs when a user actually deletes their account
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('🔔 eBay deletion notification:', body)
  return NextResponse.json({ message: 'Logged successfully.' })
}
