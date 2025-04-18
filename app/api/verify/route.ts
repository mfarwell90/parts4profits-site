// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export const runtime = 'nodejs'  // so we can use crypto.createHash

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const challenge = url.searchParams.get('challenge_code')
  if (!challenge) {
    return NextResponse.json(
      { error: 'Missing challenge_code' },
      { status: 400 }
    )
  }

  const token = process.env.EBAY_VERIFICATION_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'Server misconfiguration: no EBAY_VERIFICATION_TOKEN' },
      { status: 500 }
    )
  }

  // Build the exact endpoint string eBay called us on:
  const endpoint = url.origin + url.pathname

  // Hash in the order eBay expects: challenge + token + endpoint
  const hash = createHash('sha256')
    .update(challenge)
    .update(token)
    .update(endpoint)
    .digest('hex')

  return NextResponse.json({ challengeResponse: hash })
}

export async function POST(req: NextRequest) {
  // eBay will POST you JSON when a user actually deletes their account
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('🗑️  Account deletion notification:', JSON.stringify(body, null, 2))

  // (You can swap in your MailerSend or whatever here, but it’s optional.)
  return NextResponse.json({ message: 'Logged successfully.' })
}
