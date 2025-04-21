// app/api/search-active/route.ts
import { NextRequest, NextResponse } from 'next/server'

type ItemSummary = {
  title: string
  price?: { value?: number; currency?: string }
  thumbnailImages?: Array<{ imageUrl?: string }>
  itemWebUrl: string
  itemEndDate?: string
}

type BrowseResponse = {
  itemSummaries?: ItemSummary[]
}

export async function GET(request: NextRequest) {
  // 1) derive your own origin so we can call our token endpoint
  const origin = new URL(request.url).origin

  // 2) fetch eBay OAuth token from your /api/ebay-token route
  const tokenRes = await fetch(`${origin}/api/ebay-token`)
  if (!tokenRes.ok) {
    const txt = await tokenRes.text()
    return NextResponse.json(
      { error: `Token fetch failed: ${txt}` },
      { status: tokenRes.status }
    )
  }
  const { token } = (await tokenRes.json()) as { token: string }

  // 3) pull the year/make/model/details out of the query
  const url     = new URL(request.url)
  const year    = url.searchParams.get('year')    ?? ''
  const make    = url.searchParams.get('make')    ?? ''
  const model   = url.searchParams.get('model')   ?? ''
  const details = url.searchParams.get('details') ?? ''

  const rawQuery     = `${year} ${make} ${model} ${details}`.trim()
  const encodedQuery = encodeURIComponent(rawQuery)

  // 4) build & call the eBay Browse API for ACTIVE listings
  const apiUrl =
    `https://api.ebay.com/buy/browse/v1/item_summary/search` +
    `?q=${encodedQuery}&filter=conditions:{USED}&limit=40&sort=END_TIME`

  const resp = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
  })
  if (!resp.ok) {
    const txt = await resp.text()
    return NextResponse.json(
      { error: `Browse API failed: ${txt}` },
      { status: resp.status }
    )
  }

  // 5) type‐annotate & transform the response into your Item shape
  const data  = (await resp.json()) as BrowseResponse
  const items = (data.itemSummaries ?? []).map(item => ({
    title:    item.title,
    price:    item.price?.value?.toString() ?? '',
    currency: item.price?.currency,
    image:    item.thumbnailImages?.[0]?.imageUrl,
    link:     item.itemWebUrl,
    soldDate: item.itemEndDate,
  }))

  return NextResponse.json(items)
}
