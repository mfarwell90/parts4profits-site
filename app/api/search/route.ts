// app/api/search/route.ts
import { NextResponse } from 'next/server'

// shape of each item coming back from eBay’s Browse API
interface EbayItemSummary {
  title: string
  price?: {
    value: number
    currency: string
  }
  thumbnailImages?: Array<{
    imageUrl: string
  }>
  itemWebUrl: string
  itemEndDate?: string
}

// what we’ll return to the client
export interface SearchResultItem {
  title: string
  price?: number
  currency?: string
  image?: string
  link: string
  soldDate?: string
}

export async function GET(request: Request) {
  // pull ?q= from incoming URL
  const { searchParams } = new URL(request.url)
  const rawQuery = searchParams.get('q') ?? ''
  const encodedQuery = encodeURIComponent(rawQuery)

  // fetch your server‐side token endpoint
  const tokenRes = await fetch(`${request.nextUrl.origin}/api/ebay-token`)
  const { token } = (await tokenRes.json()) as { token: string }

  // build the eBay Browse API URL
  const url =
    'https://api.ebay.com/buy/browse/v1/item_summary/search' +
    `?q=${encodedQuery}` +
    `&filter=conditions:{USED}` +
    `&limit=20` +
    `&sort=END_TIME`

  // call eBay
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

  // cast to our expected shape
  const data = (await resp.json()) as { itemSummaries?: EbayItemSummary[] }

  // map into the shape our frontend needs
  const items: SearchResultItem[] = (data.itemSummaries ?? []).map(
    (it) => ({
      title: it.title,
      price: it.price?.value,
      currency: it.price?.currency,
      image: it.thumbnailImages?.[0]?.imageUrl,
      link: it.itemWebUrl,
      soldDate: it.itemEndDate,
    })
  )

  return NextResponse.json(items)
}
