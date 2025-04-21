// app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server'

type Item = {
  title:    string
  price:    string
  currency: string
  image?:   string
  link:     string
  soldDate: string
}

export async function GET(request: NextRequest) {
  // 1) fetch OAuth token
  const origin   = new URL(request.url).origin
  const tokenRes = await fetch(`${origin}/api/ebay-token`)
  if (!tokenRes.ok) {
    const txt = await tokenRes.text()
    return NextResponse.json(
      { error: `Token fetch failed: ${txt}` },
      { status: tokenRes.status }
    )
  }
  const { token } = (await tokenRes.json()) as { token: string }

  // 2) pull search params
  const url     = new URL(request.url)
  const year    = url.searchParams.get('year')    ?? ''
  const make    = url.searchParams.get('make')    ?? ''
  const model   = url.searchParams.get('model')   ?? ''
  const details = url.searchParams.get('details') ?? ''
  const rawQuery     = `${year} ${make} ${model} ${details}`.trim()
  const encodedQuery = encodeURIComponent(rawQuery)

  // 3) call Marketplace Insights item_sales/search for USED
  const apiUrl =
    `https://api.ebay.com/buy/marketplace-insights/v1_beta/item_sales/search` +
    `?q=${encodedQuery}` +
    `&filter=conditionId:{3000}` +     // 3000 = USED :contentReference[oaicite:0]{index=0}
    `&limit=40`

  const resp = await fetch(apiUrl, {
    headers: {
      Authorization:           `Bearer ${token}`,
      'Content-Type':         'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',  // specify US marketplace :contentReference[oaicite:1]{index=1}
    },
  })
  if (!resp.ok) {
    const txt = await resp.text()
    return NextResponse.json(
      { error: `Marketplace Insights API failed: ${txt}` },
      { status: resp.status }
    )
  }

  // 4) transform the response into your Item shape
  const json = await resp.json() as any
  const sales = json.itemSales ?? []
  const items: Item[] = sales.map((s: any) => ({
    title:    s.title                         || '',
    price:    s.lastSoldPrice?.value         || '',
    currency: s.lastSoldPrice?.currency      || '',
    image:    s.thumbnailImages?.[0]?.imageUrl || s.image?.imageUrl || '',
    link:     s.itemWebUrl                   || s.itemHref || '',
    soldDate: s.lastSoldDate                 || '',
  }))

  return NextResponse.json(items)
}
