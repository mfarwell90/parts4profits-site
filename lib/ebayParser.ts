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
    const title = $el.find('.s-item__title').text().trim()
    if (!title || title === 'New Listing') return // skip placeholders

    const priceText = $el.find('.s-item__price').first().text().trim()
    const m = priceText.match(/^([^\d]+)?\s*([\d,.]+)/)
    const currency = m?.[1] || ''
    const price    = m?.[2].replace(/,/g, '') || ''

    const link = $el.find('.s-item__link').attr('href') || ''
    const image = 
      $el.find('.s-item__image-img').attr('src') ||
      $el.find('.s-item__image-img').attr('data-src') ||
      ''

    const soldDate = $el
      .find('.s-item__title--tagblock .POSITIVE')
      .text()
      .trim()

    items.push({ title, price, currency, link, image, soldDate })
  })

  return items
}
