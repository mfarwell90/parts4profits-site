// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parseEbayHtml, Item } from "../../../lib/ebayParser";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const UA_FIREFOX =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0";

type ItemOut = Item & { soldDate?: string };
type ItemWithHref = Item & { link?: string; url?: string; price?: string | number };

const BASE_CAT = "https://www.ebay.com/sch/6028/i.html";
const BASE_GENERIC = "https://www.ebay.com/sch/i.html";

function noStoreHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function buildParams(rawQuery: string, perPage: number, page: number, priceMin?: number, priceMax?: number) {
  const p = new URLSearchParams({
    _nkw: rawQuery,
    LH_ItemCondition: "3000",
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "10",
    rt: "nc",
    _ipg: String(Math.min(Math.max(perPage, 10), 240)),
    _pgn: String(Math.max(page, 1)),
  });
  if (typeof priceMin === "number") p.set("_udlo", String(priceMin));
  if (typeof priceMax === "number") p.set("_udhi", String(priceMax));
  return p;
}

function browserHeaders(ua: string) {
  return {
    "user-agent": ua,
    "accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-store",
    "upgrade-insecure-requests": "1",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "sec-fetch-user": "?1",
    "sec-fetch-dest": "document",
    "referer": "https://www.ebay.com/",
  };
}

async function fetchHtml(url: string, ua: string, ms = 14000): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: browserHeaders(ua),
      cache: "no-store",
      next: { revalidate: 0 },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function looksLikeBotCheck(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes("verify you're a human") ||
    h.includes("robot") ||
    h.includes("captcha") ||
    h.includes("to continue, please")
  );
}

function coercePriceToNumber(p?: string | number): number | null {
  if (p == null) return null;
  if (typeof p === "number") return p;
  const m = String(p).replace(/[, ]/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  return m ? parseFloat(m[1]) : null;
}

export async function GET(request: NextRequest) {
  const meta: Record<string, unknown> = {};
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") ?? "";
    const make = url.searchParams.get("make") ?? "";
    const model = url.searchParams.get("model") ?? "";
    const details = url.searchParams.get("details") ?? "";
    const junkyard = url.searchParams.get("junkyard") === "1";
    const priceMin = junkyard ? 100 : undefined;
    const priceMax = junkyard ? 400 : undefined;
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 240));

    if (!year || !make || !model) {
      return new NextResponse(JSON.stringify({ items: [], meta: { error: "year make model required" } }), {
        status: 200,
        headers: noStoreHeaders(),
      });
    }

    const rawQuery = `${year} ${make} ${model} ${details}`.trim();
    const perPage = Math.min(Math.max(limit, 10), 120);

    const params = buildParams(rawQuery, perPage, 1, priceMin, priceMax);

    const urlPrimary = `${BASE_CAT}?${params.toString()}`;
    const urlFallback = `${BASE_GENERIC}?${params.toString()}`;
    meta.upstreamPrimary = urlPrimary;
    meta.upstreamFallback = urlFallback;

    // 1) try Chrome UA on category-anchored
    const html1 = await fetchHtml(urlPrimary, UA_CHROME);
    if (html1 && looksLikeBotCheck(html1)) {
      return new NextResponse(JSON.stringify({ items: [], meta: { ...meta, reason: "bot_check" } }), {
        status: 200,
        headers: noStoreHeaders(),
      });
    }
    let items: Item[] = html1 ? parseEbayHtml(html1) : [];

    // 2) if empty, try Firefox UA same URL
    if (!items || items.length === 0) {
      const html1b = await fetchHtml(urlPrimary, UA_FIREFOX);
      if (html1b && looksLikeBotCheck(html1b)) {
        return new NextResponse(JSON.stringify({ items: [], meta: { ...meta, reason: "bot_check" } }), {
          status: 200,
          headers: noStoreHeaders(),
        });
      }
      if (html1b) {
        const parsed = parseEbayHtml(html1b);
        if (parsed && parsed.length > 0) items = parsed;
      }
    }

    // 3) if still empty, hit generic base with Chrome UA
    if (!items || items.length === 0) {
      const html2 = await fetchHtml(urlFallback, UA_CHROME);
      if (html2 && looksLikeBotCheck(html2)) {
        return new NextResponse(JSON.stringify({ items: [], meta: { ...meta, reason: "bot_check" } }), {
          status: 200,
          headers: noStoreHeaders(),
        });
      }
      if (html2) {
        const parsed2 = parseEbayHtml(html2);
        if (parsed2 && parsed2.length > 0) items = parsed2;
      }
    }

    // 4) last try: generic with Firefox UA
    if (!items || items.length === 0) {
      const html3 = await fetchHtml(urlFallback, UA_FIREFOX);
      if (html3 && looksLikeBotCheck(html3)) {
        return new NextResponse(JSON.stringify({ items: [], meta: { ...meta, reason: "bot_check" } }), {
          status: 200,
          headers: noStoreHeaders(),
        });
      }
      if (html3) {
        const parsed3 = parseEbayHtml(html3);
        if (parsed3 && parsed3.length > 0) items = parsed3;
      }
    }

    if (!items || items.length === 0) {
      return new NextResponse(JSON.stringify({ items: [], meta: { ...meta, reason: "empty_parse" } }), {
        status: 200,
        headers: noStoreHeaders(),
      });
    }

    const filtered = items.filter((it) => {
      const n = coercePriceToNumber((it as ItemWithHref).price);
      if (n == null) return true;
      if (typeof priceMin === "number" && n < priceMin) return false;
      if (typeof priceMax === "number" && n > priceMax) return false;
      return true;
    });

    const finalItems: ItemOut[] = filtered.slice(0, limit);
    meta.count = finalItems.length;

    return new NextResponse(JSON.stringify({ items: finalItems, meta }), {
      status: 200,
      headers: noStoreHeaders(),
    });
  } catch {
    return new NextResponse(JSON.stringify({ items: [], meta: { reason: "exception" } }), {
      status: 200,
      headers: noStoreHeaders(),
    });
  }
}
