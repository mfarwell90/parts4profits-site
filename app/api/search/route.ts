// app/api/search/route.ts
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // 1) grab query params
  const { searchParams } = new URL(request.url)
  const year    = searchParams.get('year')    ?? ''
  const make    = searchParams.get('make')    ?? ''
  const model   = searchParams.get('model')   ?? ''
  const details = searchParams.get('details') ?? ''

  // 2) fetch your server‑side token endpoint
  const origin   = new URL(request.url).origin
  const tokenRes = await fetch(`${origin}/api/ebay-token`)
  const { token } = (await tokenRes.json()) as { token: string }

  // 3) build the eBay Browse API URL
  const encodedQuery = encodeURIComponent(`${year} ${make} ${model} ${details}`.trim())
  const url =
    `https://api.ebay.com/buy/browse/v1/item_summary/search`
    + `?q=${encodedQuery}`
    + `&filter=conditions:{USED}`
    + `&limit=20`
    + `&sort=END_TIME`

  // 4) call eBay
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
  })

  if (!resp.ok) {
    const err = await resp.text()
    return NextResponse.json(
      { error: `Browse API failed: ${err}` },
      { status: resp.status },
    )
  }

  // 5) pull out only the fields we care about
  const data  = await resp.json()
  const items = (data.itemSummaries || []).map(it => ({
    title:    it.title,
    price:    it.price?.value  ?? '',
    currency: it.price?.currency,
    image:    it.thumbnailImages?.[0]?.imageUrl,
    link:     it.itemWebUrl,
    soldDate: it.itemEndDate,
  }))  // <-- note the `));` and semicolon here

  return NextResponse.json(items)
}
