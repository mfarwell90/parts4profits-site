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
    sacat: "6028",  // Parts & Accessories
    _dcat: "6028",
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "10",
    rt: "nc",
    _ipg: "240",
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
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// map of href -> "Aug 18, 2025"
function mapSoldDatesByHref(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const map: Record<string, string> = {};
  $(".s-item").each((_, el) => {
    const a = $(el).find(".s-item__link").first();
    const href = a.attr("href") ?? "";
    if (!href) return;
    const caption =
      $(el)
        .find(
          ".s-item__caption, .s-item__caption--signal, .s-item__subtitle, .s-item__title--tagblock"
        )
        .text() || "";
    const m = caption.match(/\bSold\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i);
    if (m) map[href] = m[1];
  });
  return map;
}

// conservative vehicle filter
function dropObviousVehicles(items: Item[]): Item[] {
  const vehicleWords =
    /\b(car|truck|sedan|coupe|suv|wagon|hatchback|convertible|miles|odometer|vin|clean title|salvage title)\b/i;
  return items.filter((i) => !vehicleWords.test((i.title ?? "").toString()));
}

// locally extend Item to avoid any-casts
type ItemWithHref = Item & { link?: string; url?: string };

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") ?? "";
    const make = url.searchParams.get("make") ?? "";
    const model = url.searchParams.get("model") ?? "";
    const details = url.searchParams.get("details") ?? "";
    const debug = url.searchParams.get("debug") === "1";

    if (!year || !make || !model) {
      return NextResponse.json(
        { error: "year make model required" },
        { status: 400 }
      );
    }

    const rawQuery = `${year} ${make} ${model} ${details}`.trim();
    const htmlUrl = buildUrl(rawQuery);

    // fetch with timeout, retry once
    let resp = await fetchWithTimeout(htmlUrl);
    if (!resp.ok) resp = await fetchWithTimeout(htmlUrl);

    if (!resp.ok) {
      if (debug) {
        return NextResponse.json({
          upstreamUrl: htmlUrl,
          status: resp.status,
          items: [],
        });
      }
      return NextResponse.json([], { status: 200 });
    }

    const html = await resp.text();
    const mentionsCaptcha =
      /captcha|enable javascript|access denied|automated access/i.test(html);

    // parse using your existing parser
    let items: Item[] = [];
    try {
      items = parseEbayHtml(html) || [];
    } catch {
      items = [];
    }

    // only parts, no whole vehicles
    items = dropObviousVehicles(items);

    // attach soldDate when available
    const soldDates = mapSoldDatesByHref(html);
    const enriched = items.map((it) => {
      const href =
        (it as ItemWithHref).link ?? (it as ItemWithHref).url ?? "";
      const soldDate = soldDates[href];
      return soldDate ? { ...(it as object), soldDate } : it;
    });

    if (debug) {
      return NextResponse.json({
        upstreamUrl: htmlUrl,
        status: resp.status,
        bytes: html.length,
        mentionsCaptcha,
        count: enriched.length,
      });
    }

    return NextResponse.json(enriched, { status: 200 });
  } catch {
    // do not expose unused error variable
    return NextResponse.json([], { status: 200 });
  }
}
