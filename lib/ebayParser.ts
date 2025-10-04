// lib/ebayParser.ts
import * as cheerio from "cheerio";

export type Item = {
  title: string;
  price: string;
  currency?: string;
  image?: string;
  link: string;
};

function clean(txt: string) {
  return txt.replace(/\s+/g, " ").trim();
}

function fromSelectors($: cheerio.CheerioAPI): Item[] {
  const out: Item[] = [];
  // eBay rotates between li.s-item / div.s-item and variants
  let nodes = $(".s-item");
  if (nodes.length === 0) nodes = $("li.s-item, div.s-item");
  if (nodes.length === 0) nodes = $('[data-view*="mi:"] .s-item'); // some experiments

  nodes.each((_, el) => {
    const $el = $(el);

    const title =
      clean($el.find(".s-item__title").first().text()) ||
      clean($el.find(".s-item__title span").first().text());

    const price =
      clean($el.find(".s-item__price").first().text()) ||
      clean($el.find(".s-item__detail--primary").first().text());

    const link =
      $el.find(".s-item__link").attr("href") ||
      $el.find("a[href^='https://www.ebay.']").attr("href") ||
      "";

    const image =
      $el.find(".s-item__image-img").attr("src") ||
      $el.find("img").attr("src") ||
      "";

    // Skip promo tiles / placeholders
    if (!title || /shop on ebay/i.test(title)) return;
    if (!price || !link) return;

    out.push({
      title,
      price,
      link,
      image: image || undefined,
      currency: /USD/i.test(price) ? "USD" : undefined,
    });
  });

  return out;
}

/**
 * Many SRP pages include JSON-LD with @type ItemList and itemListElement
 * which gives us name, url, image, price, currency in a stable format.
 */
function fromJsonLD($: cheerio.CheerioAPI): Item[] {
  const out: Item[] = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    let txt = $(s).contents().text();
    if (!txt) return;
    try {
      // Sometimes eBay concatenates multiple JSON objects; try to parse each
      // Split on }{ boundaries safely.
      const chunks = txt
        .replace(/}\s*{/g, "}|||{")
        .split("|||")
        .map((c) => c.trim())
        .filter(Boolean);

      for (const chunk of chunks) {
        let data: any;
        try {
          data = JSON.parse(chunk);
        } catch {
          continue;
        }
        // Look for ItemList
        const lists: any[] = [];
        if (Array.isArray(data)) lists.push(...data);
        else lists.push(data);

        for (const node of lists) {
          const type = (node["@type"] || node.type || "").toString().toLowerCase();
          if (type !== "itemlist") continue;
          const arr = node.itemListElement || node.itemlist || [];
          for (const el of arr) {
            const item = el.item || el;
            if (!item) continue;
            const title = clean(item.name || "");
            const link = item.url || "";
            const image = Array.isArray(item.image) ? item.image[0] : item.image;
            // price may live under offers
            const offers = item.offers || {};
            const price =
              clean(String(offers.price || offers.priceSpecification?.price || "")) ||
              clean(String(item.price || ""));
            const currency =
              offers.priceCurrency ||
              offers.priceSpecification?.priceCurrency ||
              (price.includes("USD") ? "USD" : undefined);

            if (title && link && price) {
              out.push({
                title,
                price,
                currency,
                image,
                link,
              });
            }
          }
        }
      }
    } catch {
      /* ignore bad JSON blobs */
    }
  });
  return out;
}

export function parseEbayHtml(html: string): Item[] {
  const $ = cheerio.load(html);

  // 1) Try selector-based parsing
  let items = fromSelectors($);
  if (items.length > 0) return items;

  // 2) Fall back to JSON-LD ItemList if selectors found nothing
  items = fromJsonLD($);
  if (items.length > 0) return items;

  // 3) Last chance: look for generic anchors with price nearby (very permissive)
  const loose: Item[] = [];
  $("a[href*='ebay.com/itm']").each((_, a) => {
    const $a = $(a);
    const link = $a.attr("href") || "";
    const title = clean($a.text());
    if (!title || !link) return;

    // Walk up a bit and try to find a price string in siblings
    const ctx = $a.closest("li,div");
    const priceText =
      clean(ctx.find("*:contains('$')").first().text()) ||
      clean($a.parent().text());

    if (/\$\s*\d/.test(priceText)) {
      loose.push({
        title,
        price: priceText,
        link,
      });
    }
  });

  return loose;
}
