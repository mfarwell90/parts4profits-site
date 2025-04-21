// app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { parseEbayHtml } from '@/lib/ebayParser'  // wherever your HTML parser lives

export async function GET(request: NextRequest) {
  const url    = new URL(request.url)
  const year   = url.searchParams.get('year')    ?? ''
  const make   = url.searchParams.get('make')    ?? ''
  const model  = url.searchParams.get('model')   ?? ''
  const details= url.searchParams.get('details') ?? ''
  const rawQuery = `${year} ${make} ${model} ${details}`.trim()
  const encoded = encodeURIComponent(rawQuery)

  // eBay “Sold & Completed” search
  const htmlUrl =
    `https://www.ebay.com/sch/i.html?_nkw=${encoded}` +
    `&LH_Sold=1&LH_Complete=1&LH_ItemCondition=3000`

  const resp = await fetch(htmlUrl)
  if (!resp.ok) {
    return NextResponse.json(
      { error: `Failed to fetch eBay HTML: ${resp.status}` },
      { status: resp.status }
    )
  }

  const html  = await resp.text()
  const items = parseEbayHtml(html)   // your existing scraper/parser

  return NextResponse.json(items)
}
