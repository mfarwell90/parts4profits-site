// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parseEbayHtml, Item } from "../../../lib/ebayParser";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

type ItemOut = Item & { soldDate?: string };
type ItemWithHref = Item & { link?: string; url?: string; price?: string | number };

const BASE = "https://www.ebay.com/sch/6028/i.html";

function noStoreHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function buildUrl(rawQuery: string, ipg: number, priceMin?: number, priceMax?: number) {
  const p = new URLSearchParams({
    _nkw: rawQuery,
    LH_ItemCondition: "3000", // Used
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "10",
    rt: "nc",
    _ipg: String(Math.min(Math.max(ipg, 10), 240)),
  });
  if (typeof priceMin === "number") p.set("_udlo", String(priceMin));
  if (typeof priceMax === "number") p.set("_udhi", String(priceMax));
  return `${BASE}?${p.toString()}`;
}

async function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        "accept-language": "en-US,en;q=0.9",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      next: { revalidate: 0 },
      redirect: "follow",
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function mapSoldDatesByHref(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const map: Record<string, string> = {};
  $(".s-item").each((_, el) => {
    const a = $(el).find(".s-item__link").first();
    const href = a.attr("href") ?? "";
    if (!href) return;

    const caption =
      $(el)
        .find(".s-item__caption, .s-item__caption--signal, .s-item__subtitle, .s-item__title--tagblock")
        .text() || "";

    const m = caption.match(/\bSold\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i);
    if (m) map[href] = m[1];
  });
  return map;
}

function coercePriceToNumber(p?: string | number): number | null {
  if (p == null) return null;
  if (typeof p === "number") return p;
  const m = p.replace(/[, ]/g, "").match(/(\d+(?:\.\d{1,2})?)/);
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
    const debug = url.searchParams.get("debug") === "1";

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
    const htmlUrl = buildUrl(rawQuery, limit, priceMin, priceMax);
    meta.upstreamUrl = htmlUrl;

    let resp = await fetchWithTimeout(htmlUrl);
    if (!resp.ok) resp = await fetchWithTimeout(htmlUrl);

    meta.upstreamStatus = resp.status;

    if (!resp.ok || resp.status === 429 || resp.status === 403) {
      return new NextResponse(JSON.stringify({ items: [], meta: { ...meta, reason: "upstream_blocked" } }), {
        status: 200,
        headers: noStoreHeaders(),
      });
    }

    const html = await resp.text();
    meta.bytes = html.length;

    // parse
    let items: Item[] = [];
    try {
      items = parseEbayHtml(html) || [];
    } catch {
      items = [];
    }

    // price band safety
    const priceFiltered: Item[] = items.filter((it) => {
      const n = coercePriceToNumber((it as ItemWithHref).price);
      if (n == null) return true;
      if (typeof priceMin === "number" && n < priceMin) return false;
      if (typeof priceMax === "number" && n > priceMax) return false;
      return true;
    });

    // enrich sold date
    const soldDates = mapSoldDatesByHref(html);
    const enriched: ItemOut[] = priceFiltered.map((it) => {
      const href = (it as ItemWithHref).link ?? (it as ItemWithHref).url ?? "";
      const soldDate = soldDates[href];
      return soldDate ? { ...(it as Item), soldDate } : (it as Item);
    });

    const finalItems: ItemOut[] = enriched.slice(0, limit);
    meta.count = finalItems.length;

    // Always 200 with no-store. If empty, include a reason so the UI can show a message.
    return new NextResponse(JSON.stringify({ items: finalItems, meta }), {
      status: 200,
      headers: noStoreHeaders(),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return new NextResponse(JSON.stringify({ items: [], meta: { reason: aborted ? "timeout" : "exception" } }), {
      status: 200,
      headers: noStoreHeaders(),
    });
  }
}
