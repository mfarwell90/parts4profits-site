// app/api/search/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // 1) Pull year/make/model/details from the incoming URL
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') || ''
  const make = searchParams.get('make') || ''
  const model = searchParams.get('model') || ''
  const details = searchParams.get('details') || ''
  const rawQuery = `${year} ${make} ${model} ${details}`.trim()
  const encodedQuery = encodeURIComponent(rawQuery)

  // 2) Fetch a fresh OAuth token from your own /api/ebay-token route
  const origin = new URL(request.url).origin
  const tokenRes = await fetch(`${origin}/api/ebay-token`)
  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return NextResponse.json(
      { error: `Token fetch failed: ${err}` },
      { status: tokenRes.status }
    )
  }
  const { token } = (await tokenRes.json()) as { token: string }

  // 3) Call eBay’s Browse API for sold/used items
  const url =
    `https://api.ebay.com/buy/browse/v1/item_summary/search` +
    `?q=${encodedQuery}` +
    `&filter=conditions:{USED}` +
    `&limit=20` +
    `&sort=-endTime`
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!resp.ok) {
    const errText = await resp.text()
    return NextResponse.json(
      { error: `Browse API failed: ${errText}` },
      { status: resp.status }
    )
  }

  // 4) Massage the response shape
  const data = await resp.json()
  const items = (data.itemSummaries || []).map((it: any) => ({
    title: it.title,
    price: it.price.value,
    currency: it.price.currency,
    image: it.thumbnailImages?.[0]?.imageUrl,
    link: it.itemWebUrl,
    soldDate: it.itemEndDate,
  }))

  return NextResponse.json(items)
}
