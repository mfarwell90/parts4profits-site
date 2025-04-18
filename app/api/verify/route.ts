// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

// The URL you registered with eBay for deletions:
const ENDPOINT_URL = 'https://parts4profits.com/api/verify'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const challengeCode = searchParams.get('challenge_code')
  if (!challengeCode) {
    return NextResponse.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN
  if (!verificationToken) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const hash = createHash('sha256')
  hash.update(challengeCode)
  hash.update(verificationToken)
  hash.update(ENDPOINT_URL)
  const challengeResponse = hash.digest('hex')

  return NextResponse.json({ challengeResponse })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('🔔 Received eBay deletion notification:')
  console.log(JSON.stringify(body, null, 2))

  // if you ever want to plug in MailerSend or another alert,
  // you can do it here. For now we just acknowledge.
  return NextResponse.json({ message: 'Logged successfully.' })
}
