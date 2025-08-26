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
  const json = extractFromJson(html)
  if (json.length) return dedupe(json)

  const dom = extractFromDom(html)
  if (dom.length) return dedupe(dom)

  const hrefs = extractFromHrefFallback(html)
  return dedupe(hrefs)
}

/* JSON based */
function extractFromJson(html: string): Item[] {
  const out: Item[] = []

  const re =
    /"itemId":"?(\d{12})"?[^]*?"title"\s*:\s*"(.*?)"[^]*?"(?:viewItemURL|itemWebUrl)"\s*:\s*"(https:[^"]+)"/g
  for (const m of html.matchAll(re)) {
    const title = safeUnescape(m[2])
    const link = m[3].replace(/\\u002F/g, '/')
    const pos = m.index ?? 0
    const image = findImageNear(html, pos)
    const priced = priceNear(html, pos)
    out.push({ title, price: priced.price, currency: priced.currency, image, link })
  }

  if (!out.length) {
    const re2 =
      /"itemId":"?(\d{12})"?[^]*?"title":"(.*?)"[^]*?"(?:viewItemURL|itemWebUrl)":"(https:[^"]+)"[^]*?"price":"([^"]+)"/g
    for (const m of html.matchAll(re2)) {
      const title = safeUnescape(m[2])
      const link = m[3].replace(/\\u002F/g, '/')
      const priced = splitPrice(safeUnescape(m[4]))
      out.push({ title, price: priced.price, currency: priced.currency, link })
    }
  }

  return out
}

/* DOM based */
function extractFromDom(html: string): Item[] {
  const $ = load(html)
  const items: Item[] = []

  $('li, .s-item').each((_, el) => {
    const $el = $(el)
    const $a = $el.find('a[href*="/itm/"]').first()
    const href = $a.attr('href') || ''
    const idMatch = href.match(/\/itm\/(\d{12})(?:[?"'\/]|)/)
    if (!idMatch) return

    const link = href.startsWith('http') ? href : `https://www.ebay.com/itm/${idMatch[1]}`

    const title =
      clean(
        $el.find('h3.s-item__title').first().text() ||
        $el.find('[data-testid="item-title"]').first().text() ||
        $el.find('[role="heading"]').first().text() ||
        $a.attr('aria-label') ||
        $a.text()
      ) ||
      clean($el.find('img').first().attr('alt') || '') ||
      `Item ${idMatch[1]}`

    const priceText =
      clean(
        $el.find('.s-item__price').first().text() ||
        $el.find('[data-testid="srp-list-item-price"]').first().text() ||
        $el.find('[data-testid="x-price"]').first().text() ||
        $el.text().match(/\$[\d.,]+/)?.[0] ||
        ''
      )
    const priced = splitPrice(priceText)

    const image =
      $el.find('.s-item__image-img').attr('src') ||
      $el.find('.s-item__image-img').attr('data-src') ||
      $el.find('img').first().attr('src') ||
      undefined

    const soldDate =
      clean($el.find('.s-item__title--tagblock .POSITIVE').text()) ||
      clean($el.find('.s-item__ended-date').text()) ||
      undefined

    items.push({
      title,
      price: priced.price,
      currency: priced.currency,
      image,
      link,
      soldDate,
    })
  })

  return items
}

/* Href fallback */
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
    const t =
      around.match(/"title":"(.*?)"/) ||
      around.match(/<h3[^>]*>(.*?)<\/h3>/i)
    const title = t ? safeUnescape(stripTags(t[1]).trim()) : `Item ${id}`
    const priced = priceNear(html, idx)
    const link = `https://www.ebay.com/itm/${id}`
    out.push({ title, price: priced.price, currency: priced.currency, link })
  }
  return out
}

/* helpers */
function clean(s: string) {
  return s.replace(/\s+/g, ' ').trim()
}

function splitPrice(text: string): { price: string; currency: string } {
  const m = text.match(/^\s*([A-Z]{1,3}|US|C)?\s*\$?\s*([\d.,]+)/i)
  const currency = m?.[1] && !/^US$/i.test(m[1]) ? m[1].toUpperCase() : '$'
  const price = m?.[2] ? m[2].replace(/,/g, '') : ''
  return { price, currency }
}

function priceNear(html: string, fromIndex: number): { price: string; currency: string } {
  const win = html.slice(Math.max(0, fromIndex - 1500), fromIndex + 3000)
  const m1 = win.match(/"priceValue"\s*:\s*{\s*"value"\s*:\s*([\d.]+)(?:,\s*"currency"\s*:\s*"([A-Z]{3})")?/i)
  if (m1) return { price: String(Number(m1[1])), currency: m1[2] || '$' }
  const m2 = win.match(/"currentPrice"\s*:\s*{\s*"value"\s*:\s*([\d.]+)(?:,\s*"currency"\s*:\s*"([A-Z]{3})")?/i)
  if (m2) return { price: String(Number(m2[1])), currency: m2[2] || '$' }
  const m3 = win.match(/"price"\s*:\s*"([^"]+)"/i)
  if (m3) return splitPrice(safeUnescape(m3[1]))
  const m4 = win.match(/\$([\d.,]{2,})/)
  if (m4) return { price: m4[1].replace(/,/g, ''), currency: '$' }
  return { price: '', currency: '' }
}

function findImageNear(html: string, fromIndex: number): string | undefined {
  const win = html.slice(Math.max(0, fromIndex - 1500), fromIndex + 2500)
  const m = win.match(/"galleryURL"\s*:\s*"(https:[^"]+)"/)
  return m ? m[1].replace(/\\u002F/g, '/') : undefined
}

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, '')
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
