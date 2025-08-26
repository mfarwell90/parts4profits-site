// lib/ebayParser.ts
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
  // 1) Robust JSON fragment extractor works for both active and sold pages
  const jsonItems = extractFromJsonFragments(html)
  if (jsonItems.length) return dedupe(jsonItems)

  // 2) Broader Cheerio fallback for markup drift
  const $ = load(html)
  const items: Item[] = []

  $('li.s-item, .s-item').each((_, el) => {
    const $el = $(el)

    // Title with multiple selector options
    const title =
      $el.find('h3.s-item__title').text().trim() ||
      $el.find('[role="heading"]').first().text().trim() ||
      ''

    if (!title || /new listing/i.test(title) || /shop on ebay/i.test(title)) return

    // Link with multiple selector options
    const link =
      $el.find('a.s-item__link').attr('href') ||
      $el.find('a[href*="/itm/"]').attr('href') ||
      ''

    if (!/\/itm\/\d+/.test(link)) return

    // Price and currency from common variants
    const priceText =
      $el.find('.s-item__price').first().text().trim() ||
      $el.find('[data-testid="srp-list-item-price"]').first().text().trim() ||
      ''
    const { price, currency } = splitPrice(priceText)

    // Image
    const image =
      $el.find('.s-item__image-img').attr('src') ||
      $el.find('.s-item__image-img').attr('data-src') ||
      $el.find('img').first().attr('src') ||
      undefined

    // Sold date variants
    const soldDate =
      $el.find('.s-item__title--tagblock .POSITIVE').text().trim() ||
      $el.find('.s-item__ended-date').text().trim() ||
      undefined

    items.push({ title, price, currency, link, image, soldDate })
  })

  return dedupe(items)
}

/** Pass 1: scrape resilient JSON blobs often embedded on the page */
function extractFromJsonFragments(html: string): Item[] {
  const out: Item[] = []

  // itemId + title + viewItemURL appear together frequently
  const re = /"itemId":"(\d+)".{0,600}?"title":"(.*?)".{0,600}?"viewItemURL":"(https:[^"]+)".{0,800}?(?:"currentPrice":\s*{\s*"value":\s*([\d.]+)(?:,\s*"currency":"([A-Z]{3})")?}|)"?/g

  for (const m of html.matchAll(re)) {
    const id = m[1]
    const rawTitle = m[2]
    const urlEsc = m[3]
    const priceNum = m[4] ? Number(m[4]) : undefined
    const currencyCode = m[5] || ''

    const title = safeUnescape(rawTitle)
    const link = urlEsc.replace(/\\u002F/g, '/')
    const { price, currency } = priceNum
      ? { price: String(priceNum), currency: currencyCode }
      : fallbackPriceNear(html, m.index ?? 0)

    // Try to find a nearby image url in the same blob
    const near = html.slice(m.index ?? 0, (m.index ?? 0) + 2000)
    const imgMatch = near.match(/"galleryURL":"(https:[^"]+)"/)
    const image = imgMatch ? imgMatch[1].replace(/\\u002F/g, '/') : undefined

    // Try a nearby sold date string if present
    const soldMatch =
      near.match(/"subtitle":"(Sold\s+[\w\s,]+)"/i) ||
      near.match(/"timeEnded":"([^"]+)"/i)
    const soldDate = soldMatch ? safeUnescape(soldMatch[1]) : undefined

    out.push({
      title,
      price,
      currency,
      image,
      link,
      soldDate,
    })
  }

  // Secondary JSON form, sometimes price appears as "price":"US $79.99"
  if (!out.length) {
    const re2 = /"itemId":"(\d+)".{0,600}?"title":"(.*?)".{0,600}?"viewItemURL":"(https:[^"]+)".{0,800}?"price":"([^"]+)"/g
    for (const m of html.matchAll(re2)) {
      const rawTitle = m[2]
      const urlEsc = m[3]
      const title = safeUnescape(rawTitle)
      const link = urlEsc.replace(/\\u002F/g, '/')
      const { price, currency } = splitPrice(safeUnescape(m[4]))
      out.push({ title, price, currency, link })
    }
  }

  // Last resort from href patterns if JSON keys moved
  if (!out.length) {
    for (const m of html.matchAll(/\/itm\/[^"'>]*?\/(\d{12})/g)) {
      const id = m[1]
      const nearIdx = html.indexOf(id)
      const window = html.slice(Math.max(0, nearIdx - 800), nearIdx + 1600)
      const t = window.match(/"title":"(.*?)"/)
      const u = window.match(/"viewItemURL":"(https:[^"]+)"/)
      const { price, currency } = fallbackPriceNear(html, nearIdx)
      out.push({
        title: t ? safeUnescape(t[1]) : `Item ${id}`,
        price,
        currency,
        link: u ? u[1].replace(/\\u002F/g, '/') : `https://www.ebay.com/itm/${id}`,
      })
    }
  }

  return out
}

function splitPrice(text: string): { price: string; currency: string } {
  // Examples: "US $79.99", "$79.99", "GBP 12.50"
  const m = text.match(/^\s*([A-Z]{2,3}|US)?\s*\$?\s*([\d.,]+)/i)
  const currency = m?.[1] && m[1].toUpperCase() !== 'US' ? m[1].toUpperCase() : '$'
  const price = m?.[2] ? m[2].replace(/,/g, '') : ''
  return { price, currency }
}

function fallbackPriceNear(html: string, fromIndex: number): { price: string; currency: string } {
  const win = html.slice(fromIndex, fromIndex + 2000)
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
