// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export const config = {
  api: {
    bodyParser: true,
  },
}

export async function GET(req: NextRequest) {
  // 1) Grab challenge_code from the query
  const { searchParams } = new URL(req.url)
  const challengeCode = searchParams.get('challenge_code') ?? ''

  // 2) Pull your verification token from env
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN!
  
  // 3) Reconstruct your endpoint URL exactly as eBay sees it
  const endpointUrl = `${req.nextUrl.origin}/api/verify`

  // 4) SHA256( challengeCode + verificationToken + endpointUrl )
  const hash = createHash('sha256')
  hash.update(challengeCode)
  hash.update(verificationToken)
  hash.update(endpointUrl)
  const challengeResponse = hash.digest('hex')

  // 5) Reply with JSON { challengeResponse }
  return NextResponse.json({ challengeResponse })
}

export async function POST(req: NextRequest) {
  // if eBay actually POSTs you a deletion event, just ack it
  // (or log it, or drop it—up to you)
  console.log('🛎️ eBay deletion webhook payload:', await req.json())
  return NextResponse.json({ ok: true })
}
