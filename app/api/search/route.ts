// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parseEbayHtml, Item } from "../../../lib/ebayParser";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const maxDuration = 20;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function buildUrl(rawQuery: string) {
  const p = new URLSearchParams({
    _nkw: rawQuery,
    sacat: "6028",   // Parts & Accessories
    _dcat: "6028",   // second lock to the same category
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "10",      // newly listed first
    rt: "nc",
    _ipg: "240"
  });
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
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// grab “Sold Aug 18, 2025” style text keyed by item URL
function mapSoldDatesByHref(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const map: Record<string, string> = {};
  $(".s-item").each((_, el) => {
    const a = $(el).find(".s-item__link").first();
    const href = a.attr("href") || "";
    if (!href) return;
    const caption =
      $(el).find(".s-item__caption, .s-item__caption--signal, .s-item__subtitle, .s-item__title--tagblock").text() || "";
    const m = caption.match(/\bSold\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i);
    if (m) map[href] = m[1];
  });
  return map;
}

// conservative vehicle filter to drop whole cars that slip into the page shell
function dropObviousVehicles(items: Item[]): Item[] {
  const vehicleWords = /\b(car|truck|sedan|coupe|suv|wagon|hatchback|convertible|miles|odometer|vin|clean title|salvage title)\b/i;
  return items.filter(i => !vehicleWords.test(i.title || ""));
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") ?? "";
    const make = url.searchParams.get("make") ?? "";
    const model = url.searchParams.get("model") ?? "";
    const details = url.searchParams.get("details") ?? "";
    const debug = url.searchParams.get("debug") === "1";

    if (!year || !make || !model) {
      return NextResponse.json({ error: "year make model required" }, { status: 400 });
    }

    const rawQuery = `${year} ${make} ${model} ${details}`.trim();
    const htmlUrl = buildUrl(rawQuery);

    // fetch with timeout, retry once on non-OK or abort
    let resp = await fetchWithTimeout(htmlUrl);
    if (!resp.ok) resp = await fetchWithTimeout(htmlUrl);

    if (!resp.ok) {
      if (debug) {
        return NextResponse.json({ upstreamUrl: htmlUrl, status: resp.status, items: [] });
      }
      return NextResponse.json([], { status: 200 });
    }

    const html = await resp.text();
    const mentionsCaptcha = /captcha|enable javascript|access denied|automated access/i.test(html);

    // Parse as you do today
    let items: Item[] = [];
    try {
      items = parseEbayHtml(html) || [];
    } catch {
      items = [];
    }

    // Extra guards so only parts survive
    items = dropObviousVehicles(items);

    // Optional soldDate enrichment that won’t break your types at runtime
    // We key by href and attach soldDate if found.
    const soldDates = mapSoldDatesByHref(html);
    const enriched = items.map((it: Item) => {
      const href = (it as any).link || (it as any).url || "";
      const soldDate = soldDates[href] || null;
      return soldDate ? Object.assign({}, it, { soldDate }) : it;
    });

    if (debug) {
      return NextResponse.json({
        upstreamUrl: htmlUrl,
        status: resp.status,
        bytes: html.length,
        mentionsCaptcha,
        count: enriched.length
      });
    }

    // Always succeed with an array so the page does not “stick” until redeploy
    return NextResponse.json(enriched, { status: 200 });
  } catch (e: unknown) {
    // Never throw: return an empty array so the UI stays alive
    return NextResponse.json([], { status: 200 });
  }
}
