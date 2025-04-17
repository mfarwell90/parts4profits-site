// app/api/search/route.ts
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // 1) grab query params
  const { searchParams } = new URL(request.url)
  const year    = searchParams.get('year')    ?? ''
  const make    = searchParams.get('make')    ?? ''
  const model   = searchParams.get('model')   ?? ''
  const details = searchParams.get('details') ?? ''
  const rawQuery = [year, make, model, details].filter(Boolean).join(' ')

  // 2) fetch our own token endpoint
  const origin   = new URL(request.url).origin
  const tokenRes = await fetch(`${origin}/api/ebay-token`)
  if (!tokenRes.ok) {
    const { error } = await tokenRes.json()
    return NextResponse.json({ error }, { status: tokenRes.status })
  }
  const { token } = await tokenRes.json()

  // 3) call eBay Browse API (only SOLD / USED items)
  const encodedQuery = encodeURIComponent(rawQuery)
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search`
    + `?q=${encodedQuery}`
    + `&filter=conditions:{USED}`
    + `&limit=20`
    + `&sort=END_TIME`

  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!resp.ok) {
    const err = await resp.text()
    return NextResponse.json({ error: err }, { status: resp.status })
  }

  // 4) pick out only the fields we need
  const data = await resp.json()
  const items = (data.itemSummaries || []).map((it: any) => ({
    title:    it.title,
    price:    it.price?.value     ?? '',
    currency: it.price?.currency,
    image:    it.thumbnailImages?.[0]?.imageUrl,
    link:     it.itemWebUrl,
    soldDate: it.itemEndDate,
  }))

  return NextResponse.json(items)
}
