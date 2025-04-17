// app/api/ebay-token/route.ts
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  const scope = process.env.EBAY_API_SCOPE

  if (!clientId || !clientSecret || !scope) {
    return NextResponse.json({ error: 'Missing eBay credentials' }, { status: 500 })
  }

  // build the Basic auth header
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    scope,
  })

  const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`,
    },
    body: params.toString(),
  })

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text()
    return NextResponse.json({ error: err }, { status: tokenResponse.status })
  }

  const { access_token } = await tokenResponse.json()
  return NextResponse.json({ token: access_token })
}
