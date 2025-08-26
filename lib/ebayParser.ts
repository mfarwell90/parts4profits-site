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
  // Pass 1: robust JSON fragments used on both active and sold pages
  const jsonItems = extractFromJsonFragments(html)
  if (jsonItems.length) return dedupe(jsonItems)

  // Pass 2: broader Cheerio fallback for markup drift
  const $ = load(html)
  const items: Item[] = []

  $('li.s-item, .s-item').each((_, el) => {
    const $el = $(el)

    const title =
      $el.find('h3.s-item__title').text().trim() ||
      $el.find('[role="heading"]').first().text().trim() ||
      ''

    if (!title || /new listing/i.test(title) || /shop on ebay/i.test(title)) return

    const link =
      $el.find('a.s-item__link').attr('href') ||
      $el.find('a[href*="/itm/"]').attr('href') ||
      ''

    if (!/\/itm\/\d+/.test(link)) return

    const priceText =
      $el.find('.s-item__price').first().text().trim() ||
      $el.find('[data-testid="srp-list-item-price"]').first().text().trim() ||
      ''
    const { price, currency } = splitPrice(priceText)

    const image =
      $el.find('.s-item__image-img').attr('src') ||
      $el.find('.s-item__image-img').attr('data-src') ||
      $el.find('img').first().attr('src') ||
      undefined

    const soldDate =
      $el.find('.s-item__title--tagblock .POSITIVE').text().trim() ||
      $el.find('.s-item__ended-date').text().trim() ||
      undefined

    items.push({ title, price, currency, link, image, soldDate })
  })

  return dedupe(items)
}

function extractFromJsonFragments(html: string): Item[] {
  const out: Item[] = []

  // Common JSON blob on SRP
  const re =
    /"itemId":"(\d+)".{0,600}?"title":"(.*?)".{0,600}?"viewItemURL":"(https:[^"]+)".{0,800}?(?:"currentPrice":\s*{\s*"value":\s*([\d.]+)(?:,\s*"currency":"([A-Z]{3})")?}|)"?/g

  for (const m of html.matchAll(re)) {
    const rawTitle = m[2]
    const urlEsc = m[3]
    const priceNum = m[4] ? Number(m[4]) : undefined
    const currencyCode = m[5] || ''

    const title = safeUnescape(rawTitle)
    const link = urlEsc.replace(/\\u002F/g, '/')
    const priced =
      typeof priceNum === 'number'
        ? { price: String(priceNum), currency: currencyCode }
        : fallbackPriceNear(html, m.index ?? 0)

    const near = html.slice(m.index ?? 0, (m.index ?? 0) + 2000)
    const imgMatch = near.match(/"galleryURL":"(https:[^"]+)"/)
    const image = imgMatch ? imgMatch[1].replace(/\\u002F/g, '/') : undefined

    const soldMatch =
      near.match(/"subtitle":"(Sold\s+[\w\s,]+)"/i) ||
      near.match(/"timeEnded":"([^"]+)"/i)
    const soldDate = soldMatch ? safeUnescape(soldMatch[1]) : undefined

    out.push({
      title,
      price: priced.price,
      currency: priced.currency,
      image,
      link,
      soldDate,
    })
  }

  if (!out.length) {
    const re2 =
      /"itemId":"(\d+)".{0,600}?"title":"(.*?)".{0,600}?"viewItemURL":"(https:[^"]+)".{0,800}?"price":"([^"]+)"/g
    for (const m of html.matchAll(re2)) {
      const title = safeUnescape(m[2])
      const link = m[3].replace(/\\u002F/g, '/')
      const priced = splitPrice(safeUnescape(m[4]))
      out.push({ title, price: priced.price, currency: priced.currency, link })
    }
  }

  if (!out.length) {
    for (const m of html.matchAll(/\/itm\/[^"'>]*?\/(\d{12})/g)) {
      const idPos = html.indexOf(m[1])
      const window = html.slice(Math.max(0, idPos - 800), idPos + 1600)
      const t = window.match(/"title":"(.*?)"/)
      const u = window.match(/"viewItemURL":"(https:[^"]+)"/)
      const priced = fallbackPriceNear(html, idPos)
      out.push({
        title: t ? safeUnescape(t[1]) : `Item ${m[1]}`,
        price: priced.price,
        currency: priced.currency,
        link: u ? u[1].replace(/\\u002F/g, '/') : `https://www.ebay.com/itm/${m[1]}`,
      })
    }
  }

  return out
}

function splitPrice(text: string): { price: string; currency: string } {
  const m = text.match(/^\s*([A-Z]{2,3}|US)?\s*\$?\s*([\d.,]+)/i)
  const currency =
    m?.[1] && m[1].toUpperCase() !== 'US' ? m[1].toUpperCase() : '$'
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
  try {
    return JSON.parse(`"${s.replace(/"/g, '\\"')}"`)
  } catch {
    return s
  }
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
