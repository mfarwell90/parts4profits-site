// lib/ebayParser.ts
import * as cheerio from "cheerio";

export type Item = {
  title: string;
  price: string;
  currency?: string;
  link: string;
  soldDate?: string;
};

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function normalizeEbayUrl(href: string): string {
  if (!href) return "";
  const m = href.match(/https?:\/\/[^/]*ebay\.com\/itm\/[^"?#]+/i);
  if (m) return m[0];
  if (/^https?:\/\//i.test(href)) return href;
  return `https://www.ebay.com${href.startsWith("/") ? "" : "/"}${href}`;
}
function guessCurrencyFromPrice(p: string): string | undefined {
  if (/\bUSD\b/i.test(p) || p.includes("$")) return "USD";
  if (/\bGBP\b/i.test(p) || p.includes("£")) return "GBP";
  if (/\bEUR\b/i.test(p) || p.includes("€")) return "EUR";
  return undefined;
}
function extractSoldDateFromText(txt: string): string | undefined {
  const sold =
    txt.match(/Sold\s+[A-Za-z]{3}\s+\d{1,2},\s*\d{4}/) ||
    txt.match(/Sold\s+[A-Za-z]{3}\s+\d{1,2}/);
  if (sold) return sold[0].replace(/^Sold\s+/i, "").trim();
  const ended = txt.match(/Ended:\s*[A-Za-z]{3}\s+\d{1,2},\s*\d{4}/);
  if (ended) return ended[0].replace(/^Ended:\s*/i, "").trim();
  return undefined;
}

/* ------------ SELECTOR PASS ------------ */
function fromSelectors($: cheerio.CheerioAPI): Item[] {
  const out: Item[] = [];
  let nodes = $(".s-item");
  if (nodes.length === 0) nodes = $("li.s-item, div.s-item");
  if (nodes.length === 0) nodes = $('[data-view*="mi:"] .s-item');

  nodes.each((_, el) => {
    const $el = $(el);
    const rawText = $el.text();
    if (/Sponsored/i.test(rawText) || /Shop on eBay/i.test(rawText) || /Explore related/i.test(rawText)) return;

    const linkEl =
      $el.find("a.s-item__link").first().attr("href") ||
      $el.find("a[href*='/itm/']").first().attr("href") ||
      $el.find("a[href*='ebay.com/itm']").first().attr("href") ||
      "";
    const link = normalizeEbayUrl(linkEl);

    const title =
      clean($el.find("h3.s-item__title").first().text()) ||
      clean($el.find("h3").first().text()) ||
      clean($el.find("a.s-item__link").attr("aria-label") || "") ||
      clean($el.find("a").first().text());

    const price =
      clean($el.find("span.s-item__price").first().text()) ||
      clean($el.find("span:contains('$')").first().text()) ||
      (rawText.match(/\$\s?\d[\d,]*(?:\.\d{2})?/)?.[0] ?? "").trim();

    const currency = guessCurrencyFromPrice(price);
    const soldDate =
      extractSoldDateFromText(
        clean(
          $el.find(".s-item__title--tag, .s-item__details, .s-item__subtitle, .s-item__caption").text() ||
            rawText
        )
      ) || undefined;

    if (title && price && link) out.push({ title, price, currency, link, soldDate });
  });
  return out;
}

/* ------------ JSON-LD PASS ------------ */
type JSONLDOffer = {
  price?: string | number;
  priceCurrency?: string;
  priceSpecification?: { price?: string | number; priceCurrency?: string };
};
type JSONLDItem = { name?: string; url?: string; image?: string | string[]; price?: string | number; offers?: JSONLDOffer };
type JSONLDList = { ["@type"]?: string; itemListElement?: Array<{ item?: JSONLDItem } | JSONLDItem> };

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
            const link = normalizeEbayUrl(String(item.url ?? ""));
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
              guessCurrencyFromPrice(price);

            if (title && link && price) out.push({ title, price, currency, link });
          }
        }
      } catch {
        /* ignore */
      }
    }
  });
  return out;
}

/* ------------ __SRP_DATA__ PASS ------------ */
function fromSRPData(html: string): Item[] {
  const out: Item[] = [];
  const marker = "__SRP_DATA__";
  const idx = html.indexOf(marker);
  if (idx < 0) return out;

  // locate JSON object
  let start = -1;
  for (let i = idx; i < html.length; i++) {
    if (html[i] === "{") { start = i; break; }
  }
  if (start < 0) return out;

  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) return out;

  const jsonText = html.slice(start, end);
  try {
    const root: unknown = JSON.parse(jsonText);
    const candidates: unknown[] = [];
    if (isObject(root)) {
      for (const k of Object.keys(root)) {
        const v = (root as Record<string, unknown>)[k];
        if (isObject(v)) candidates.push(v);
      }
    }

    const visit = (node: unknown): void => {
      if (!isObject(node)) return;

      // explicit traversal to satisfy no-unused-expressions
      const values = Object.values(node);
      for (const val of values) {
        if (Array.isArray(val)) {
          for (const it of val) visit(it);
        } else if (isObject(val)) {
          visit(val);
        }
      }

      const anyNode = node as Record<string, unknown>;
      const title = typeof anyNode.title === "string" ? anyNode.title : undefined;
      const url = typeof anyNode.url === "string" ? anyNode.url : undefined;

      let priceStr: string | undefined;
      let currency: string | undefined;

      if (typeof anyNode.price === "string") {
        priceStr = anyNode.price;
      } else if (isObject(anyNode.price)) {
        const p = anyNode.price as Record<string, unknown>;
        const v = p.value;
        if (typeof v === "string" || typeof v === "number") priceStr = String(v);
        if (typeof p.currency === "string") currency = p.currency;
      }

      if (!priceStr && isObject(anyNode.marketingPrice)) {
        const mp = anyNode.marketingPrice as Record<string, unknown>;
        const mpPrice = mp.price;
        if (isObject(mpPrice)) {
          const pp = mpPrice as Record<string, unknown>;
          const vv = pp.value;
          if (typeof vv === "string" || typeof vv === "number") priceStr = String(vv);
          if (typeof pp.currency === "string") currency = String(pp.currency);
        }
      }

      const subtitle = typeof anyNode.subtitle === "string" ? anyNode.subtitle : "";
      const meta = typeof anyNode.meta === "string" ? anyNode.meta : "";
      const badge = typeof anyNode.badge === "string" ? anyNode.badge : "";
      const soldDate = extractSoldDateFromText(clean(`${subtitle} ${meta} ${badge}`));

      if (title && url && priceStr) {
        out.push({
          title: clean(title),
          price: currency ? `${currency} ${priceStr}` : String(priceStr),
          currency: currency ?? undefined,
          link: normalizeEbayUrl(url),
          soldDate,
        });
      }
    };

    for (const c of candidates) visit(c);
  } catch {
    /* ignore parse errors */
  }

  return out;
}

/* ------------ MAIN ------------ */
export function parseEbayHtml(html: string): Item[] {
  const $ = cheerio.load(html);

  let items = fromSelectors($);
  if (items.length > 0) return items;

  items = fromJsonLD($);
  if (items.length > 0) return items;

  items = fromSRPData(html);
  if (items.length > 0) return items;

  return parseLooseRegexOnly(html);
}

/* ------------ ULTRA-LOOSE REGEX PROBE (debug aide) ------------ */
export function parseLooseRegexOnly(html: string): Item[] {
  const out: Item[] = [];
  const anchorRe = /<a[^>]+href="([^"]*\/itm\/[^"]+)"[^>]*>(.*?)<\/a>/gis;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((m = anchorRe.exec(html))) {
    const href = m[1];
    const rawTitle = m[2].replace(/<[^>]+>/g, "");
    const title = clean(rawTitle);
    const link = normalizeEbayUrl(href);
    if (!title || !link) continue;
    if (seen.has(link)) continue;
    seen.add(link);

    const lookAhead = html.slice(m.index, m.index + 1500);
    const priceMatch = lookAhead.match(/\$\s?\d[\d,]*(?:\.\d{2})?/);
    const price = priceMatch ? priceMatch[0] : "";

    if (price) {
      out.push({ title, price, currency: guessCurrencyFromPrice(price), link });
    }
    if (out.length >= 100) break;
  }
  return out;
}
