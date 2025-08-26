// app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { parseEbayHtml } from '../../../lib/ebayParser'

export const runtime = 'nodejs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const year    = url.searchParams.get('year')    ?? ''
    const make    = url.searchParams.get('make')    ?? ''
    const model   = url.searchParams.get('model')   ?? ''
    const details = url.searchParams.get('details') ?? ''
    const debug   = url.searchParams.get('debug') === '1'

    if (!year || !make || !model) {
      return NextResponse.json({ error: 'year make model required' }, { status: 400 })
    }

    const rawQuery = `${year} ${make} ${model} ${details}`.trim()
    const q = encodeURIComponent(rawQuery)

    // Sold + Completed + Used, stable params
    const htmlUrl =
      `https://www.ebay.com/sch/i.html?_nkw=${q}` +
      `&LH_Sold=1&LH_Complete=1&LH_ItemCondition=3000&_sop=10&rt=nc`

    const resp = await fetch(htmlUrl, {
      headers: {
        'user-agent': UA,
        'accept-language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    })

    const html = await resp.text()
    const mentionsCaptcha = /captcha|enable javascript|access denied|automated access/i.test(html)
    const bytes = html.length

    const items = resp.ok ? parseEbayHtml(html) : []

    if (debug) {
      return NextResponse.json({
        upstreamUrl: htmlUrl,
        status: resp.status,
        bytes,
        mentionsCaptcha,
        parsedCount: Array.isArray(items) ? items.length : 0,
        sample: html.slice(0, 400),
      })
    }

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Failed to fetch sold listings: ${resp.status}` },
        { status: resp.status }
      )
    }

    return NextResponse.json(items)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
