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
  let nodes = $(".s-item");
  if (nodes.length === 0) nodes = $("li.s-item, div.s-item");
  if (nodes.length === 0) nodes = $('[data-view*="mi:"] .s-item');

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

/* ---------- JSON-LD parsing (no `any`) ---------- */

type JSONLDOffer = {
  price?: string | number;
  priceCurrency?: string;
  priceSpecification?: { price?: string | number; priceCurrency?: string };
};

type JSONLDItem = {
  name?: string;
  url?: string;
  image?: string | string[];
  price?: string | number;
  offers?: JSONLDOffer;
};

type JSONLDList = {
  ["@type"]?: string;
  itemListElement?: Array<{ item?: JSONLDItem } | JSONLDItem>;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asItemList(node: unknown): JSONLDList | null {
  if (!isObject(node)) return null;
  const t = String((node as Record<string, unknown>)["@type"] ?? "").toLowerCase();
  if (t !== "itemlist") return null;
  return node as JSONLDList;
}

function extractItemsFromList(list: JSONLDList): Item[] {
  const out: Item[] = [];
  const arr = Array.isArray(list.itemListElement) ? list.itemListElement : [];
  for (const el of arr) {
    const item: JSONLDItem | undefined = isObject(el)
      ? ((el as Record<string, unknown>).item as JSONLDItem) ?? (el as JSONLDItem)
      : undefined;

    if (!item) continue;

    const title = clean(String(item.name ?? ""));
    const link = String(item.url ?? "");
    const imageRaw = item.image;
    const image = Array.isArray(imageRaw) ? imageRaw[0] : imageRaw;

    const offers = item.offers;
    const priceVal =
      (offers?.priceSpecification?.price ??
        offers?.price ??
        item.price ??
        "") as string | number;

    const price = clean(String(priceVal));
    const currency =
      offers?.priceSpecification?.priceCurrency ??
      offers?.priceCurrency ??
      (price.includes("USD") ? "USD" : undefined);

    if (title && link && price) {
      out.push({ title, price, currency, image, link });
    }
  }
  return out;
}

function fromJsonLD($: cheerio.CheerioAPI): Item[] {
  const out: Item[] = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    const txt = $(s).contents().text();
    if (!txt) return;

    const chunks = txt.replace(/}\s*{/g, "}|||{").split("|||").map((c) => c.trim()).filter(Boolean);
    for (const chunk of chunks) {
      try {
        const parsed: unknown = JSON.parse(chunk);
        const nodes: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of nodes) {
          const list = asItemList(node);
          if (!list) continue;
          out.push(...extractItemsFromList(list));
        }
      } catch {
        // ignore bad chunk
      }
    }
  });
  return out;
}

export function parseEbayHtml(html: string): Item[] {
  const $ = cheerio.load(html);

  let items = fromSelectors($);
  if (items.length > 0) return items;

  items = fromJsonLD($);
  if (items.length > 0) return items;

  // very loose final fallback
  const loose: Item[] = [];
  $("a[href*='ebay.com/itm']").each((_, a) => {
    const $a = $(a);
    const link = $a.attr("href") || "";
    const title = clean($a.text());
    if (!title || !link) return;
    const ctx = $a.closest("li,div");
    const priceText =
      clean(ctx.find("*:contains('$')").first().text()) ||
      clean($a.parent().text());
    if (/\$\s*\d/.test(priceText)) {
      loose.push({ title, price: priceText, link });
    }
  });
  return loose;
}
