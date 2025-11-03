// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parseEbayHtml, Item } from "../../../lib/ebayParser";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ItemOut = Item & { soldDate?: string };
type ItemWithHref = Item & { link?: string; url?: string; price?: string | number };

const BASE_CAT = "https://www.ebay.com/sch/6028/i.html";
const BASE_GENERIC = "https://www.ebay.com/sch/i.html";

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
];

function noStoreHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

// 13 ended recent, 16 highest price
function buildParams(
  rawQuery: string,
  perPage: number,
  page: number,
  priceMin?: number,
  priceMax?: number,
  mode: "last" | "high" = "last"
) {
  const p = new URLSearchParams({
    _nkw: rawQuery,
    LH_ItemCondition: "3000",
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: mode === "high" ? "16" : "13",
    rt: "nc",
    _ipg: String(Math.min(Math.max(perPage, 10), 240)),
    _pgn: String(Math.max(page, 1)),
    _dmd: "2", // force classic server-rendered markup
  });
  if (typeof priceMin === "number") p.set("_udlo", String(priceMin));
  if (typeof priceMax === "number") p.set("_udhi", String(priceMax));
  return p;
}

function headersFor(ua: string) {
  return {
    "user-agent": ua,
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-store",
    "upgrade-insecure-requests": "1",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "sec-fetch-user": "?1",
    "sec-fetch-dest": "document",
    referer: "https://www.ebay.com/",
  };
}

async function fetchHtml(url: string, ua: string, ms = 14000): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: headersFor(ua),
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
    h.includes("verify you are a human") ||
    h.includes("captcha") ||
    h.includes("robot") ||
    h.includes("to continue, please")
  );
}

function coercePriceToNumber(p?: string | number): number | null {
  if (p == null) return null;
  if (typeof p === "number") return p;
  const m = String(p).replace(/[, ]/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  return m ? parseFloat(m[1]) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(request: NextRequest) {
  const meta: Record<string, unknown> = {};
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") ?? "";
    const make = url.searchParams.get("make") ?? "";
    const model = url.searchParams.get("model") ?? "";
    const details = url.searchParams.get("details") ?? "";
    const modeParam = (url.searchParams.get("mode") ?? "last").toLowerCase();
    const mode: "last" | "high" = modeParam === "high" ? "high" : "last";

    const junkyard = url.searchParams.get("junkyard") === "1";
    const priceMin = junkyard ? 100 : undefined;
    const priceMax = junkyard ? 400 : undefined;

    const limit = Math.max(
      1,
      Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 240)
    );

    if (!year || !make || !model) {
      return new NextResponse(
        JSON.stringify({ items: [], meta: { error: "year make model required" } }),
        { status: 200, headers: noStoreHeaders() }
      );
    }

    const rawQuery = `${year} ${make} ${model} ${details}`.trim();
    const perPage = Math.min(Math.max(limit, 10), 120);

    const params = buildParams(rawQuery, perPage, 1, priceMin, priceMax, mode);

    const urlGeneric = `${BASE_GENERIC}?${params.toString()}`;
    const urlCat = `${BASE_CAT}?${params.toString()}`;
    meta.upstreamPrimary = urlGeneric;
    meta.upstreamFallback = urlCat;
    meta.mode = mode;

    const plan = [
      { url: urlGeneric, ua: UAS[0], tag: "generic-chrome" },
      { url: urlGeneric, ua: UAS[1], tag: "generic-firefox" },
      { url: urlCat, ua: UAS[0], tag: "cat-chrome" },
      { url: urlCat, ua: UAS[2], tag: "cat-safari" },
    ];

    let items: Item[] = [];
    let used: { url: string; tag: string } | null = null;

    for (let i = 0; i < plan.length; i++) {
      const jitter = 250 + Math.floor(Math.random() * 650);
      if (i > 0) await sleep(jitter * i);

      const { url: u, ua, tag } = plan[i];
      const html = await fetchHtml(u, ua);
      if (!html) continue;
      if (looksLikeBotCheck(html)) {
        meta.reason = "bot_check";
        meta.lastTried = { url: u, tag };
        return new NextResponse(JSON.stringify({ items: [], meta }), {
          status: 200,
          headers: noStoreHeaders(),
        });
      }
      const parsed = parseEbayHtml(html);
      if (parsed.length > 0) {
        items = parsed;
        used = { url: u, tag };
        break;
      }
    }

    if (!items || items.length === 0) {
      return new NextResponse(
        JSON.stringify({ items: [], meta: { ...meta, reason: "empty_parse" } }),
        { status: 200, headers: noStoreHeaders() }
      );
    }

    const filtered: Item[] = items.filter((it) => {
      const n = coercePriceToNumber((it as ItemWithHref).price);
      if (n == null) return true;
      if (typeof priceMin === "number" && n < priceMin) return false;
      if (typeof priceMax === "number" && n > priceMax) return false;
      return true;
    });

    const finalItems: ItemOut[] = filtered.slice(0, limit);

    // sanitize without unused var: delete 'image' if present
    const sanitized: ItemOut[] = finalItems.map((it) => {
      const copy: Record<string, unknown> = { ...(it as Record<string, unknown>) };
      if ("image" in copy) delete copy.image;
      return copy as ItemOut;
    });

    meta.count = sanitized.length;
    if (used) meta.resolvedVia = used;

    return new NextResponse(JSON.stringify({ items: sanitized, meta }), {
      status: 200,
      headers: noStoreHeaders(),
    });
  } catch (err) {
    console.error("search error:", err);
    return new NextResponse(
      JSON.stringify({ items: [], meta: { reason: "exception" } }),
      { status: 200, headers: noStoreHeaders() }
    );
  }
}
