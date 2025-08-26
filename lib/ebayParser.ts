import { load, Cheerio, Element } from 'cheerio'

export type Item = {
  title:    string
  price:    string
  currency: string
  image?:   string
  link:     string
  soldDate?: string
}

export function parseEbayHtml(html: string): Item[] {
  // Pass 1: JSON fragments
  const jsonItems = extractFromJsonFragments(html)
  if (jsonItems.length) return dedupe(jsonItems)

  // Pass 2: DOM-aware extraction from actual result <li> blocks
  const domItems = extractFromDom(html)
  if (domItems.length) return dedupe(domItems)

  // Pass 3: href fallback if the DOM structure changes again
  const hrefItems = extractFromHrefFallback(html)
  return dedupe(hrefItems)
}

/* ---------- PASS 1: JSON blobs ---------- */

function extractFromJsonFragments(html: string): Item[] {
  const out: Item[] = []

  const reA =
    /"itemId":"?(\d{12})"?[^]*?"title":"(.*?)"[^]*?"viewItemURL":"(https:[^"]+)"/g
  for (const m of html.matchAll(reA)) {
    const title = safeUnescape(m[2])
    const link  = m[3].replace(/\\u002F/g, '/')
    const priced = fallbackPriceNear(html, m.index ?? 0)
    const image  = findImageNear(html, m.index ?? 0)

    out.push({
      title,
      price: priced.price,
      currency: priced.currency,
      image,
      link,
      soldDate: undefined,
    })
  }

  // If not found, try price as string form
  if (!out.length) {
    const reB =
      /"itemId":"?(\d{12})"?[^]*?"title":"(.*?)"[^]*?"viewItemURL":"(https:[^"]+)"[^]*?"price":"([^"]+)"/g
    for (const m of html.matchAll(reB)) {
      const title = safeUnescape(m[2])
      const link  = m[3].replace(/\\u002F/g, '/')
      const priced = splitPrice(safeUnescape(m[4]))
      out.push({ title, price: priced.price, currency: priced.currency, link })
    }
  }

  return out
}

/* ---------- PASS 2: DOM list items ---------- */

function extractFromDom(html: string): Item[] {
  const $ = load(html)
  const items: Item[] = []

  // Target generic list items that contain an /itm/ link
  $('li:has(a[href*="/itm/"]), .s-item:has(a[href*="/itm/"])').each((_, el) => {
    const $el = $(el as Element)

    const $a = $el.find('a[href*="/itm/"]').first()
    const href = $a.attr('href') || ''
    const idMatch = href.match(/\/itm\/(\d{12})(?:[?"'\/]|)/)
    if (!idMatch) return

    const link = href.startsWith('http') ? href : `https://www.ebay.com/itm/${idMatch[1]}`

    // Title candidates in order
    const title =
      textClean(
        $el.find('h3.s-item__title').first().text() ||
        $el.find('[role="heading"]').first().text() ||
        $a.text()
      ) ||
      // sometimes the alt text holds a good title
      textClean($el.find('img').first().attr('alt') || '') ||
      `Item ${idMatch[1]}`

    // Price candidates in order
    const priceText =
      textClean(
        $el.find('.s-item__price').first().text() ||
        $el.find('[data-testid="srp-list-item-price"]').first().text() ||
        // grab any $… looking text in this block
        $el.text().match(/\$[\d.,]+/)?.[0] || ''
      )
    const { price, currency } = splitPrice(priceText)

    // Image
    const image =
      $el.find('.s-item__image-img').attr('src') ||
      $el.find('.s-item__image-img').attr('data-src') ||
      $el.find('img').first().attr('src') ||
      undefined

    // Sold date variants
    const soldDate =
      textClean($el.find('.s-item__title--tagblock .POSITIVE').text()) ||
      textClean($el.find('.s-item__ended-date').text()) ||
      undefined

    items.push({ title, price, currency, image, link, soldDate })
  })

  return items
}

/* ---------- PASS 3: href fallback only ---------- */

function extractFromHrefFallback(html: string): Item[] {
  const out: Item[] = []
  const ids = new Set<string>()

  for (const r of [
    /\/itm\/[^"'>]*?\/(\d{12})(?:[?"'\/]|)/g,
    /\/itm\/(\d{12})(?:[?"'\/]|)/g,
    /https:\\\/\\\/www\.ebay\.com\\\/itm\\\/(\d{12})/g,
  ]) {
    for (const m of html.matchAll(r)) ids.add(m[1])
  }

  for (const id of ids) {
    const idx = html.indexOf(id)
    const around = html.slice(Math.max(0, idx - 1500), idx + 2500)

    const title =
      safeUnescape(
        (around.match(/"title":"(.*?)"/)?.[1] || '').trim()
      ) || `Item ${id}`

    const priced = fallbackPriceNear(html, idx)
    const link = `https://www.ebay.com/itm/${id}`

    out.push({ title, price: priced.price, currency: priced.currency, link })
  }
  return out
}

/* ---------- utilities ---------- */

function textClean(s: string) {
  return s.replace(/\s+/g, ' ').trim()
}

function splitPrice(text: string): { price: string; currency: string } {
  // Examples: "US $79.99", "$79.99", "GBP 12.50"
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

function findImageNear(html: string, fromIndex: number): string | undefined {
  const win = html.slice(Math.max(0, fromIndex - 1500), fromIndex + 2500)
  const m = win.match(/"galleryURL":"(https:[^"]+)"/)
  return m ? m[1].replace(/\\u002F/g, '/') : undefined
}

function safeUnescape(s: string) {
  try { return JSON.parse(`"${s.replace(/"/g, '\\"')}"`) } catch { return s }
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
