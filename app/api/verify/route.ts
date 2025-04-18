import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export async function GET(request: NextRequest) {
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN!
  const endpointUrl = 'https://parts4profits.com/api/verify'

  const url = new URL(request.url)
  const challengeCode = url.searchParams.get('challenge_code') || ''

  const hash = createHash('sha256')
  hash.update(challengeCode)
  hash.update(verificationToken)
  hash.update(endpointUrl)

  const challengeResponse = hash.digest('hex')
  return NextResponse.json({ challengeResponse })
}

export async function POST(request: NextRequest) {
  // eBay will POST your notification here
  const payload = await request.json()
  console.log('🔔 eBay deletion event:', payload)

  // (optionally send yourself an email)
  // …

  return NextResponse.json({ status: 'received' })
}
