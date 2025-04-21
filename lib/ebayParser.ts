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
  const $ = load(html)
  const items: Item[] = []

  $('.s-item').each((_, el) => {
    const $el = $(el)

    // Title & skip placeholders
    const title = $el.find('.s-item__title').text().trim()
    if (
      !title ||
      title === 'New Listing' ||
      /shop on ebay/i.test(title)
    ) return

    // Link & skip promo blocks
    const link = $el.find('.s-item__link').attr('href') || ''
    if (!/\/itm\/\d+/.test(link)) return

    // Price & currency
    const priceText = $el.find('.s-item__price').first().text().trim()
    const m = priceText.match(/^([^\d]+)?\s*([\d,.]+)/)
    const currency = m?.[1] || ''
    const price    = m?.[2].replace(/,/g, '') || ''

    // Image (optional)
    const image =
      $el.find('.s-item__image-img').attr('src') ||
      $el.find('.s-item__image-img').attr('data-src') ||
      undefined

    // Sold date (if present)
    const soldDate = $el
      .find('.s-item__title--tagblock .POSITIVE')
      .text()
      .trim() || undefined

    items.push({ title, price, currency, link, image, soldDate })
  })

  return items
}
