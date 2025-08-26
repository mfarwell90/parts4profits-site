import { NextRequest, NextResponse } from 'next/server'
import { parseEbayHtml, Item } from '../../../lib/ebayParser'

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

    // Sold + Completed + Used with stable params
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

    const parsed = resp.ok ? parseEbayHtml(html) : []
    const items = await hydrateMissing(parsed)

    if (debug) {
      return NextResponse.json({
        upstreamUrl: htmlUrl,
        status: resp.status,
        bytes,
        mentionsCaptcha,
        parsedCount: parsed.length,
        hydratedCount: items.length,
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

/* -------- hydration for rows missing title or price -------- */

async function hydrateMissing(items: Item[]): Promise<Item[]> {
  if (!Array.isArray(items) || items.length === 0) return items

  const needs = items
    .map((it, i) => ({ it, i }))
    .filter(x => !x.it?.title || !x.it?.price)

  const batch = needs.slice(0, 20) // keep fast
  if (batch.length === 0) return items

  const results = await Promise.all(
    batch.map(async x => {
      try {
        const r = await fetch(x.it.link, {
          headers: {
            'user-agent': UA,
            'accept-language': 'en-US,en;q=0.9',
          },
          cache: 'no-store',
        })
        const html = await r.text()
        const patch = extractFromItemPage(html)
        return { idx: x.i, patch }
      } catch {
        return { idx: x.i, patch: emptyPatch() }
      }
    })
  )

  for (const { idx, patch } of results) {
    const before = items[idx]
    items[idx] = {
      ...before,
      title: before.title || patch.title || before.title,
      price: before.price || patch.price || before.price,
      currency: before.currency || patch.currency || '$',
      image: before.image || patch.image || before.image,
    }
  }

  return items
}

type Patch = { title: string; price: string; currency: string; image?: string }
function emptyPatch(): Patch {
  return { title: '', price: '', currency: '$' }
}

function extractFromItemPage(html: string): Patch {
  const get = (re: RegExp): string => {
    const m = html.match(re)
    return m ? m[1].trim() : ''
  }

  // title candidates
  const tOg   = get(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
  const tTw   = get(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)
  const tTag  = get(/<title>([^<]+)<\/title>/i).replace(/\s*\|\s*eBay.*$/i, '')
  const title = tOg || tTw || tTag || ''

  // price candidates (currency captured when available; unused vars removed)
  const pA = get(/"priceValue"\s*:\s*{\s*"value"\s*:\s*([\d.]+)/i)
  const pB = get(/"currentPrice"\s*:\s*{\s*"value"\s*:\s*([\d.]+)/i)
  const pC = get(/"price"\s*:\s*"([^"]+)"/i) // display string like US $79.99
  const priceStr = pA || pB || pC || get(/\$([\d.,]{2,})/)
  const priced = splitPrice(pC || priceStr)

  // image candidates
  const image =
    get(/<meta\s+property="og:image"\s+content="(https:[^"]+)"/i) ||
    get(/"image"\s*:\s*"(https:[^"]+)"/i)

  return {
    title,
    price: priced.price,
    currency: priced.currency || '$',
    image: image ? image.replace(/\\u002F/g, '/') : undefined,
  }
}

// simple splitter shared with parser
function splitPrice(text: string): { price: string; currency: string } {
  const m = (text || '').match(/^\s*([A-Z]{1,3}|US|C)?\s*\$?\s*([\d.,]+)/i)
  const currency = m?.[1] && !/^US$/i.test(m[1]) ? m[1].toUpperCase() : '$'
  const price = m?.[2] ? m[2].replace(/,/g, '') : ''
  return { price, currency }
}
