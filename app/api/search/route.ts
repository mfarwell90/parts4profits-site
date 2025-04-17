import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // fetch eBay OAuth token
  const tokenRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ebay-token`);
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return NextResponse.json({ error: `Token fetch failed: ${errText}` }, { status: tokenRes.status });
  }
  const { token } = await tokenRes.json() as { token: string };

  // parse query params
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year') || '';
  const make = searchParams.get('make') || '';
  const model = searchParams.get('model') || '';
  const details = searchParams.get('details') || '';

  const rawQuery = `${year} ${make} ${model} ${details}`.trim();
  const encodedQuery = encodeURIComponent(rawQuery);

  // call eBay Browse API
  const url =
    `https://api.ebay.com/buy/browse/v1/item_summary/search?` +
    `q=${encodedQuery}&filter=conditions:{USED}&limit=20&sort=END_TIME`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return NextResponse.json({ error: `Browse API failed: ${errText}` }, { status: resp.status });
  }

  // type annotate response
  const data = await resp.json() as {
    itemSummaries?: Array<{
      title: string;
      price?: { value: number; currency?: string };
      thumbnailImages?: Array<{ imageUrl: string }>;
      itemWebUrl: string;
      itemEndDate: string;
    }>;
  };

  // extract only needed fields
  const items = (data.itemSummaries || []).map((it) => ({
    title: it.title,
    price: it.price?.value ?? '',
    currency: it.price?.currency,
    image: it.thumbnailImages?.[0]?.imageUrl,
    link: it.itemWebUrl,
    soldDate: it.itemEndDate,
  }));

  return NextResponse.json(items);
}
