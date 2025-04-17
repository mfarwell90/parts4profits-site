import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')
  const make = searchParams.get('make')
  const model = searchParams.get('model')
  const details = searchParams.get('details') || ''

  if (!year || !make || !model) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // 1) Grab a fresh token
  const tokenRes = await fetch('http://localhost:3000/api/ebay-token')
  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return NextResponse.json({ error: `Token fetch failed: ${err}` }, { status: 502 })
  }
  const { token } = await tokenRes.json()

  // 2) Build the query (including extra details)
  const rawQuery = `${year} ${make} ${model} ${details}`.trim()
  const encodedQuery = encodeURIComponent(rawQuery)

  // 3) Call the Browse API (only SOLD / USED items)
  const url =
    `https://api.ebay.com/buy/browse/v1/item_summary/search` +
    `?q=${encodedQuery}` +
    `&filter=conditions:{USED}` +
    `&limit=20` +
    `&sort=END_TIME`

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!resp.ok) {
    const errText = await resp.text()
    return NextResponse.json({ error: `Browse API failed: ${errText}` }, { status: resp.status })
  }

  const data = await resp.json()
  const items = (data.itemSummaries || []).map((it: any) => ({
    title: it.title,
    price: it.price?.value,
    currency: it.price?.currency,
    image: it.thumbnailImages?.[0]?.imageUrl,
    link: it.itemWebUrl,
    soldDate: it.itemEndDate,      // <-- sold date field
  }))

  return NextResponse.json(items)
}
