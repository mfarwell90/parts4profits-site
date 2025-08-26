import { NextRequest, NextResponse } from 'next/server'
import { parseEbayHtml, Item } from '../../../lib/ebayParser'

export const runtime = 'nodejs'
// If your Vercel plan allows, raise the cap:
export const maxDuration = 20; // remove or lower if your plan < 20s

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
    const hydrate = url.searchParams.get('hydrate') !== '0' // allow ?hydrate=0 to skip

    if (!year || !make || !model) {
      return NextResponse.json({ error: 'year make model required' }, { status: 400 })
    }

    const rawQuery = `${year} ${make} ${model} ${details}`.trim()
    const q = encodeURIComponent(rawQuery)

    const htmlUrl =
      `https://www.ebay.com/sch/i.html?_nkw=${q}` +
      `&LH_Sold=1&LH_Complete=1&LH_ItemCondition=3000&_sop=10&rt=nc`

    const resp = await fetch(htmlUrl, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
      cache: 'no-store',
    })

    const html = await resp.text()
    const mentionsCaptcha = /captcha|enable javascript|access denied|automated access/i.test(html)
    const bytes = html.length

    const parsed = resp.ok ? parseEbayHtml(html) : []
    const started = Date.now()
    const items = hydrate
      ? await hydrateMissing(parsed, started)
      : parsed

    if (debug) {
      return NextResponse.json({
        upstreamUrl: htmlUrl,
        status: resp.status,
        bytes,
        mentionsCaptcha,
        parsedCount: parsed.length,
        hydratedCount: items.length,
        tookMs: Date.now() - started,
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

/* -------- timeout-safe hydration -------- */

const HYDRATE_MAX = 6;           // only fix a handful per request
const HYDRATE_PER_FETCH_MS = 1500; // 1.5s cap per item page
const OVERALL_BUDGET_MS = 6000;    // stop if we’re near 6s total

async function hydrateMissing(items: Item[], requestStartMs: number): Promise<Item[]> {
  if (!Array.isArray(items) || items.length === 0) return items

  const needs = items
    .map((it, i) => ({ it, i }))
    .filter(x => !x.it?.title || !x.it?.price)
    .slice(0, HYDRATE_MAX)

  if (!needs.length) return items

  const results = await Promise.allSettled(
    needs.map(async x => {
      // bail out if we’re close to our overall budget
      if (Date.now() - requestStartMs > OVERALL_BUDGET_MS) {
        return { idx: x.i, patch: emptyPatch() }
      }
      return { idx: x.i, patch: await fetchItemPatch(x.it.link) }
    })
  )

  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const { idx, patch } = r.value as { idx: number; patch: Patch }
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

async function fetchItemPatch(url: string): Promise<Patch> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), HYDRATE_PER_FETCH_MS)
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
      cache: 'no-store',
      signal: controller.signal,
    })
    const html = await r.text()
    return extractFromItemPage(html)
  } catch {
    return emptyPatch()
  } finally {
    clearTimeout(t)
  }
}

type Patch = { title: string; price: string; currency: string; image?: string }
function emptyPatch(): Patch { return { title: '', price: '', currency: '$' } }

function extractFromItemPage(html: string): Patch {
  const get = (re: RegExp): string => {
    const m = html.match(re)
    return m ? m[1].trim() : ''
  }

  const tOg  = get(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
  const tTw  = get(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)
  const tTag = get(/<title>([^<]+)<\/title>/i).replace(/\s*\|\s*eBay.*$/i, '')
  const title = tOg || tTw || tTag || ''

  const pA = get(/"priceValue"\s*:\s*{\s*"value"\s*:\s*([\d.]+)/i)
  const pB = get(/"currentPrice"\s*:\s*{\s*"value"\s*:\s*([\d.]+)/i)
  const pC = get(/"price"\s*:\s*"([^"]+)"/i)
  const priceStr = pA || pB || pC || get(/\$([\d.,]{2,})/)
  const priced = splitPrice(pC || priceStr)

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

function splitPrice(text: string): { price: string; currency: string } {
  const m = (text || '').match(/^\s*([A-Z]{1,3}|US|C)?\s*\$?\s*([\d.,]+)/i)
  const currency = m?.[1] && !/^US$/i.test(m[1]) ? m[1].toUpperCase() : '$'
  const price = m?.[2] ? m[2].replace(/,/g, '') : ''
  return { price, currency }
}
