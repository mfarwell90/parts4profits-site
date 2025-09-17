// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parseEbayHtml, Item } from "../../../lib/ebayParser";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const maxDuration = 20;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// Build sold-history URL strictly within eBay Motors Parts & Accessories, Used items only
function buildUrl(rawQuery: string, ipg: number, priceMin?: number, priceMax?: number) {
  const p = new URLSearchParams({
    _nkw: rawQuery,
    sacat: "6028",            // Parts & Accessories
    _dcat: "6028",            // secondary lock
    LH_ItemCondition: "3000", // Used
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "10",               // recent first
    rt: "nc",
    _ipg: String(Math.min(Math.max(ipg, 10), 240)), // clamp 10..240
  });

  // eBay price band filters
  if (typeof priceMin === "number") p.set("_udlo", String(priceMin));
  if (typeof priceMax === "number") p.set("_udhi", String(priceMax));

  return `https://www.ebay.com/sch/i.html?${p.toString()}`;
}

async function fetchWithTimeout(url: string, ms = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
      cache: "no-store",
      next: { revalidate: 0 },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Map href -> "Aug 18, 2025" style sold date
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

// local extension to avoid any-casts
type ItemWithHref = Item & { link?: string; url?: string; price?: string | number };

function coercePriceToNumber(p?: string | number): number | null {
  if (p == null) return null;
  if (typeof p === "number") return p;
  const m = p.replace(/[, ]/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  return m ? parseFloat(m[1]) : null;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") ?? "";
    const make = url.searchParams.get("make") ?? "";
    const model = url.searchParams.get("model") ?? "";
    const details = url.searchParams.get("details") ?? "";

    const debug = url.searchParams.get("debug") === "1";
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10) || 30, 240)); // default 30

    // Single new toggle for your checkbox
    const junkyard = url.searchParams.get("junkyard") === "1"; // 100..400

    // price band logic
    const priceMin = junkyard ? 100 : undefined;
    const priceMax = junkyard ? 400 : undefined;

    if (!year || !make || !model) {
      return NextResponse.json({ error: "year make model required" }, { status: 400 });
    }

    const rawQuery = `${year} ${make} ${model} ${details}`.trim();
    const htmlUrl = buildUrl(rawQuery, limit, priceMin, priceMax);

    // fetch with timeout, retry once
    let resp = await fetchWithTimeout(htmlUrl);
    if (!resp.ok) resp = await fetchWithTimeout(htmlUrl);

    if (!resp.ok) {
      if (debug) {
        return NextResponse.json({ upstreamUrl: htmlUrl, status: resp.status, items: [], count: 0 });
      }
      return NextResponse.json([], { status: 200 });
    }

    const html = await resp.text();
    const mentionsCaptcha =
      /captcha|enable javascript|access denied|automated access/i.test(html);

    // Parse using your current parser
    let items: Item[] = [];
    try {
      items = parseEbayHtml(html) || [];
    } catch {
      items = [];
    }

    // Server-side price filter too, in case upstream ignores _udlo/_udhi occasionally
    const priceFiltered = items.filter((it) => {
      const n = coercePriceToNumber((it as ItemWithHref).price);
      if (n == null) return true;
      if (typeof priceMin === "number" && n < priceMin) return false;
      if (typeof priceMax === "number" && n > priceMax) return false;
      return true;
    });

    // Attach soldDate from the list page where available
    const soldDates = mapSoldDatesByHref(html);
    const enriched = priceFiltered.map((it) => {
      const href = (it as ItemWithHref).link ?? (it as ItemWithHref).url ?? "";
      const soldDate = soldDates[href];
      return soldDate ? { ...(it as object), soldDate } : it;
    });

    // Cap to the requested limit
    const finalItems = enriched.slice(0, limit);

    if (debug) {
      return NextResponse.json({
        upstreamUrl: htmlUrl,
        status: resp.status,
        bytes: html.length,
        mentionsCaptcha,
        count: finalItems.length,
        sampleTitles: finalItems.slice(0, 5).map((x: any) => x.title),
      });
    }

    return NextResponse.json(finalItems, { status: 200 });
  } catch {
    // Never fail hard; return empty so UI stays alive
    return NextResponse.json([], { status: 200 });
  }
}
