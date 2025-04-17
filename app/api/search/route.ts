// app/api/search/route.ts
import { NextResponse } from 'next/server'

type ItemSummary = {
  title: string
  price: { value: string; currency: string }
  thumbnailImages?: Array<{ imageUrl: string }>
  itemWebUrl: string
  itemEndDate?: string
}

type Item = {
  title: string
  price: string
  currency?: string
  image?: string
  link: string
  soldDate?: string
}

export async function GET(request: Request) {
  try {
    // 1) Extract query params
    const { searchParams } = new URL(request.url)
    const year    = searchParams.get('year')    || ''
    const make    = searchParams.get('make')    || ''
    const model   = searchParams.get('model')   || ''
    const details = searchParams.get('details') || ''
    const query   = [year, make, model, details].filter(Boolean).join(' ')

    // 2) Grab your eBay token
    const origin = new URL(request.url).origin
    const tokenRes = await fetch(`${origin}/api/ebay-token`)
    if (!tokenRes.ok) throw new Error('Token fetch failed')
    const { token } = (await tokenRes.json()) as { token: string }

    // 3) Fetch sold/used items from eBay Browse API
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search')
    url.searchParams.set('q', query)
    url.searchParams.set('filter', 'conditions:{USED}')
    url.searchParams.set('limit', '20')
    url.searchParams.set('sort', 'END_TIME')

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    })
    if (!resp.ok) {
      const errText = await resp.text()
      return NextResponse.json({ error: `Browse API failed: ${errText}` }, { status: resp.status })
    }

    const data = (await resp.json()) as { itemSummaries?: ItemSummary[] }
    const items = (data.itemSummaries || []).map((it) => ({
      title:    it.title,
      price:    it.price.value,
      currency: it.price.currency,
      image:    it.thumbnailImages?.[0]?.imageUrl,
      link:     it.itemWebUrl,
      soldDate: it.itemEndDate,
    }))

    return NextResponse.json(items)
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 })
  }
}
