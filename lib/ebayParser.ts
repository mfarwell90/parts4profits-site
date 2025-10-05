// lib/ebayParser.ts
import * as cheerio from "cheerio";

export type Item = {
  title: string;
  price: string;
  currency?: string;
  image?: string;
  link: string;
};

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/* ---------------- HTML selectors pass ---------------- */
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

/* ---------------- JSON-LD pass ---------------- */
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

function listFromNode(node: unknown): JSONLDList | null {
  if (!isObject(node)) return null;
  const t = String((node as Record<string, unknown>)["@type"] ?? "").toLowerCase();
  return t === "itemlist" ? (node as JSONLDList) : null;
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
          const list = listFromNode(node);
          if (!list) continue;
          const arr = Array.isArray(list.itemListElement) ? list.itemListElement : [];
          for (const el of arr) {
            const item: JSONLDItem | undefined = isObject(el)
              ? ((el as Record<string, unknown>).item as JSONLDItem) ?? (el as JSONLDItem)
              : undefined;
            if (!item) continue;

            const title = clean(String(item.name ?? ""));
            const link = String(item.url ?? "");
            const imgRaw = item.image;
            const image = Array.isArray(imgRaw) ? imgRaw[0] : imgRaw;
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

            if (title && link && price) out.push({ title, price, currency, image, link });
          }
        }
      } catch {
        /* ignore */
      }
    }
  });
  return out;
}

/* ---------------- __SRP_DATA__ pass (embedded window JSON) ---------------- */
/**
 * eBay often embeds:  window.__SRP_DATA__ = { ... };
 * We extract the JSON blob via brace matching (no fragile regex for nested braces).
 */
function fromSRPData(html: string): Item[] {
  const out: Item[] = [];
  const marker = "__SRP_DATA__";
  const idx = html.indexOf(marker);
  if (idx < 0) return out;

  // Find first '{' after marker
  let start = -1;
  for (let i = idx; i < html.length; i++) {
    if (html[i] === "{") {
      start = i;
      break;
    }
  }
  if (start < 0) return out;

  // Brace matching to find the end of the JSON object
  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return out;

  const jsonText = html.slice(start, end);
  try {
    const root: unknown = JSON.parse(jsonText);
    // Walk a few common paths where results hide
    // e.g., root.srpKRs or root.srp or root.searchResults
    const candidates: unknown[] = [];
    if (isObject(root)) {
      for (const k of Object.keys(root)) {
        const v = (root as Record<string, unknown>)[k];
        if (isObject(v)) candidates.push(v);
      }
    }

    const pushItem = (title: string, price: string, link: string, image?: string, currency?: string) => {
      if (title && price && link) out.push({ title: clean(title), price: clean(price), link, image, currency });
    };

    const visit = (node: unknown) => {
      if (!isObject(node)) return;
      // Look for arrays with listing-like objects
      for (const val of Object.values(node)) {
		if (Array.isArray(val)) {
			for (const it of val) visit(it);
		} else if (isObject(val)) {
			visit(val);
		}
	}


      // Heuristic: some nodes have { title, url, price, image } or nested { marketingPrice: { price: { value, currency } } }
      const anyNode = node as Record<string, unknown>;
      const title = typeof anyNode.title === "string" ? anyNode.title : undefined;
      const url = typeof anyNode.url === "string" ? anyNode.url : undefined;
      const image =
        typeof anyNode.image === "string"
          ? anyNode.image
          : (Array.isArray(anyNode.images) && typeof anyNode.images[0] === "string" ? (anyNode.images[0] as string) : undefined);

      let priceStr: string | undefined;
      let currency: string | undefined;

      // Try several common shapes
      if (typeof anyNode.price === "string") {
        priceStr = anyNode.price;
      } else if (isObject(anyNode.price)) {
        const p = anyNode.price as Record<string, unknown>;
        if (typeof p.value === "string" || typeof p.value === "number") priceStr = String(p.value);
        if (typeof p.currency === "string") currency = p.currency;
      }
      if (!priceStr && isObject(anyNode.marketingPrice)) {
        const mp = anyNode.marketingPrice as Record<string, unknown>;
        if (isObject(mp.price)) {
          const p = mp.price as Record<string, unknown>;
          if (typeof p.value === "string" || typeof p.value === "number") priceStr = String(p.value);
          if (typeof p.currency === "string") currency = p.currency;
        }
      }

      if (title && url && priceStr) {
        const prettyPrice = currency ? `${currency} ${priceStr}` : priceStr;
        pushItem(title, prettyPrice, url, image, currency);
      }
    };

    for (const c of candidates) visit(c);
  } catch {
    /* ignore parse errors */
  }

  return out;
}

export function parseEbayHtml(html: string): Item[] {
  const $ = cheerio.load(html);

  // 1) HTML selectors
  let items = fromSelectors($);
  if (items.length > 0) return items;

  // 2) JSON-LD
  items = fromJsonLD($);
  if (items.length > 0) return items;

  // 3) __SRP_DATA__ embedded JSON (robust against layout rotations)
  items = fromSRPData(html);
  if (items.length > 0) return items;

  // 4) Very loose fallback
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
