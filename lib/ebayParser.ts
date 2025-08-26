import { load } from 'cheerio'

export type Item = {
  title:    string
  price:    string
  currency: string
  image?:   string
  link:     string
  soldDate?: string
}

export function parseEbayHtml(html: string): Item[] {
  // 1) JSON fragments in several shapes
  const jsonItems = extractFromJsonFragments(html)
  if (jsonItems.length) return dedupe(jsonItems)

  // 2) Robust href extraction for sold pages (multiple URL patterns)
  const hrefItems = extractFromHrefPatterns(html)
  if (hrefItems.length) return dedupe(hrefItems)

  // 3) Cheerio sweep across anchors if classes changed completely
  const cheerioItems = extractWithCheerioAnchors(html)
  return dedupe(cheerioItems)
}

/* ---------- helpers ---------- */

function extractFromJsonFragments(html: string): Item[] {
  const out: Item[] = []

  // Common SRP blob (quoted itemId)
  const reA =
    /"itemId":"(\d{12})".{0,700}?"title":"(.*?)".{0,700}?"viewItemURL":"(https:[^"]+)"/g
  for (const m of html.matchAll(reA)) {
    const title = safeUnescape(m[2])
    const link = m[3].replace(/\\u002F/g, '/')
    const { price, currency } = fallbackPriceNear(html, m.index ?? 0)
    out.push({ title, price, currency, link })
  }

  // Variant where itemId is unquoted
  if (!out.length) {
    const reB =
      /"itemId":\s*(\d{12}).{0,700}?"title":"(.*?)".{0,700}?"viewItemURL":"(https:[^"]+)"/g
    for (const m of html.matchAll(reB)) {
      const title = safeUnescape(m[2])
      const link = m[3].replace(/\\u002F/g, '/')
      const { price, currency } = fallbackPriceNear(html, m.index ?? 0)
      out.push({ title, price, currency, link })
    }
  }

  // Price sometimes appears as "price":"US $79.99"
  if (!out.length) {
    const reC =
      /"itemId":"?(\d{12})"?[^]*?"title":"(.*?)"[^]*?"viewItemURL":"(https:[^"]+)"[^]*?"price":"([^"]+)"/g
    for (const m of html.matchAll(reC)) {
      const title = safeUnescape(m[2])
      const link = m[3].replace(/\\u002F/g, '/')
      const priced = splitPrice(safeUnescape(m[4]))
      out.push({ title, price: priced.price, currency: priced.currency, link })
    }
  }

  return out
}

function extractFromHrefPatterns(html: string): Item[] {
  const out: Item[] = []
  const ids = new Set<string>()

  // /itm/.../123456789012 and /itm/123456789012
  const re1 = /\/itm\/[^"'>]*?\/(\d{12})(?:[?"'\/]|)/g
  const re2 = /\/itm\/(\d{12})(?:[?"'\/]|)/g
  const re3 = /https:\\\/\\\/www\.ebay\.com\\\/itm\\\/(\d{12})/g // escaped JSON hrefs

  for (const r of [re1, re2, re3]) {
    for (const m of html.matchAll(r)) ids.add(m[1])
  }

  for (const id of ids) {
    const idx = html.indexOf(id)
    const window = html.slice(Math.max(0, idx - 1200), idx + 2000)

    // Try nearby title
    const t =
      window.match(/"title":"(.*?)"/) ||
      window.match(/<h3[^>]*class="[^"]*s-item__title[^"]*"[^>]*>(.*?)<\/h3>/i)
    const title = t ? safeUnescape(stripTags(t[1]).trim()) : `Item ${id}`

    // Try nearby price
    const priced = fallbackPriceNear(html, idx)

    const link = `https://www.ebay.com/itm/${id}`
    out.push({ title, price: priced.price, currency: priced.currency, link })
  }

  return out
}

function extractWithCheerioAnchors(html: string): Item[] {
  const $ = load(html)
  const items: Item[] = []
  const seen = new Set<string>()

  $('a[href*="/itm/"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const m = href.match(/\/itm\/(\d{12})(?:[?"'\/]|)/)
    if (!m) return
    const id = m[1]
    if (seen.has(id)) return
    seen.add(id)

    const link = href.startsWith('http') ? href : `https://www.ebay.com/itm/${id}`

    // Title: anchor text or nearest heading
    const anchorText = $(el).text().trim()
    const title =
      anchorText ||
      $(el).closest('li').find('h3').first().text().trim() ||
      `Item ${id}`

    // We do not have a DOM context for prices reliably; pull from HTML near id
    const idx = html.indexOf(id)
    const priced = fallbackPriceNear(html, idx)

    items.push({ title, price: priced.price, currency: priced.currency, link })
  })

  return items
}

/* ---------- utilities ---------- */

function splitPrice(text: string): { price: string; currency: string } {
  // "US $79.99", "$79.99", "GBP 12.50"
  const m = text.match(/^\s*([A-Z]{2,3}|US)?\s*\$?\s*([\d.,]+)/i)
  const currency = m?.[1] && m[1].toUpperCase() !== 'US' ? m[1].toUpperCase() : '$'
  const price = m?.[2] ? m[2].replace(/,/g, '') : ''
  return { price, currency }
}

function fallbackPriceNear(html: string, fromIndex: number): { price: string; currency: string } {
  const win = html.slice(Math.max(0, fromIndex - 1500), fromIndex + 2500)
  const m1 = win.match(/"currentPrice":\s*{\s*"value":\s*([\d.]+)(?:,\s*"currency":"([A-Z]{3})")?/i)
  if (m1) {
    const currency = m1[2] || '$'
    return { price: String(Number(m1[1])), currency }
  }
  const m2 = win.match(/"price":"([^"]+)"/i)
  if (m2) return splitPrice(safeUnescape(m2[1]))
  const m3 = win.match(/\$([\d.,]{2,})/)
  if (m3) return { price: m3[1].replace(/,/g, ''), currency: '$' }
  return { price: '', currency: '' }
}

function safeUnescape(s: string) {
  try { return JSON.parse(`"${s.replace(/"/g, '\\"')}"`) } catch { return s }
}

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, '')
}

function dedupe(items: Item[]) {
  const seen = new Set<string>()
  const out: Item[] = []
  for (const it of items) {
    const key = it.link || `${it.title}|${it.price}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(it)
    }
  }
  return out
}
