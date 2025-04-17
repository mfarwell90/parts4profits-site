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
    // 1) grab query‑string params
    const urlObj = new URL(request.url)
    const params = urlObj.searchParams
    const year    = params.get('year')    || ''
    const make    = params.get('make')    || ''
    const model   = params.get('model')   || ''
    const details = params.get('details') || ''
    const query   = [year, make, model, details].filter(Boolean).join(' ')

    // 2) fetch your server‑side token endpoint
    const origin   = urlObj.origin
    const tokenRes = await fetch(`${origin}/api/ebay-token`)
    if (!tokenRes.ok) throw new Error('eBay token fetch failed')
    const { token } = (await tokenRes.json()) as { token: string }

    // 3) call the eBay Browse API for USED & SOLD items
    const apiUrl = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search')
    apiUrl.searchParams.set('q', query)
    apiUrl.searchParams.set('filter', 'conditions:{USED}')
    apiUrl.searchParams.set('limit', '20')
    apiUrl.searchParams.set('sort', 'END_TIME')

    const resp = await fetch(apiUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
    })
    if (!resp.ok) {
      const errText = await resp.text()
      return NextResponse.json({ error: `Browse API failed: ${errText}` }, { status: resp.status })
    }

    const data = (await resp.json()) as { itemSummaries?: ItemSummary[] }
    const items: Item[] = (data.itemSummaries || []).map(it => ({
      title:    it.title,
      price:    it.price.value,
      currency: it.price.currency,
      image:    it.thumbnailImages?.[0]?.imageUrl,
      link:     it.itemWebUrl,
      soldDate: it.itemEndDate,
    }))

    return NextResponse.json(items)
  } catch (error: unknown) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
