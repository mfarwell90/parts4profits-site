// app/api/ebay-token/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const creds = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64')

  const resp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${creds}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: process.env.EBAY_API_SCOPE!,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    return NextResponse.json({ error: errText }, { status: resp.status })
  }

  const { access_token } = await resp.json()
  return NextResponse.json({ token: access_token })
}
