// lib/ebayParser.ts
import * as cheerio from "cheerio";

export type Item = {
  title: string;
  price: string;
  currency?: string;
  image?: string;
  link: string;
};

// Normalize price text
function cleanPrice(str: string): string {
  return str.replace(/[\n\r\t]+/g, " ").trim();
}

export function parseEbayHtml(html: string): Item[] {
  const $ = cheerio.load(html);
  const items: Item[] = [];

  // Try main selector block
  let nodes = $(".s-item");
  if (nodes.length === 0) {
    // fallback: sometimes eBay wraps results differently
    nodes = $("li.s-item, div.s-item");
  }

  nodes.each((_, el) => {
    const title =
      $(el).find(".s-item__title").first().text().trim() ||
      $(el).find(".s-item__title span").first().text().trim() ||
      "";

    const price =
      cleanPrice($(el).find(".s-item__price").first().text()) ||
      cleanPrice($(el).find(".s-item__detail--primary").first().text()) ||
      "";

    const link =
      $(el).find(".s-item__link").attr("href") ||
      $(el).find("a").attr("href") ||
      "";

    const image =
      $(el).find(".s-item__image-img").attr("src") ||
      $(el).find("img").attr("src") ||
      "";

    // Skip placeholders and non-results
    if (!title || title.toLowerCase().includes("shop on ebay")) return;
    if (!price) return;

    items.push({
      title,
      price,
      link,
      image,
      currency: price.includes("USD") ? "USD" : undefined,
    });
  });

  return items;
}
