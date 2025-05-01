// app/components/SearchForm.tsx
'use client'

import { useState } from 'react'

type Item = {
  title: string
  price: string
  currency?: string
  image?: string
  link: string
  soldDate?: string
}

export default function SearchForm() {
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [details, setDetails] = useState('')
  const [results, setResults] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [fireOnly, setFireOnly] = useState(false)
  const [showActive, setShowActive] = useState(false)
  const [averagePrice, setAveragePrice] = useState<string | null>(null);

  const calculateAverage = (listings: Item[]) => { // <-- Added helper
    if (!listings.length) return "0.00";
    const total = listings.reduce((sum, item) => sum + parseFloat(item.price), 0);
    return (total / listings.length).toFixed(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const qs = new URLSearchParams({ year, make, model, details })
      const endpoint = showActive
        ? `/api/search-active?${qs.toString()}`
        : `/api/search?${qs.toString()}`

      const res = await fetch(endpoint)

      // 1) bail out on a bad response
      if (!res.ok) {
        console.error('API error:', await res.text())
        setResults([]);
		setAveragePrice(null);
        return
      }

      // 2) parse & validate the JSON is an array
      const json = await res.json()
      if (!Array.isArray(json)) {
        console.error('Unexpected API result (not an array):', json)
        setResults([]);
		setAveragePrice(null);
        return
      }

      // 3) data is safe to use now
      let data: Item[] = json
      if (fireOnly) {
        data = data.filter(it => parseFloat(it.price) > 200)
      }
      setResults(data);
	  setAveragePrice(showActive ? null : calculateAverage(data));
    } catch (err) {
      console.error('Search failed:', err)
      setResults([])
	  setAveragePrice(null);
    } finally {
      setLoading(false)
    }
  }

  const rawQuery = `${year} ${make} ${model} ${details}`.trim()
  const soldSearchUrl =
    `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(rawQuery)}` +
    `&LH_Sold=1&LH_Complete=1&LH_ItemCondition=3000`
  const activeSearchUrl =
    `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(rawQuery)}`
  const affiliateSearchUrl = 
    `https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=` +
    `${process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID}&toolid=10001&mpre=` +
    `${encodeURIComponent(activeSearchUrl)}`

  // Flip‑Score Summary counts
  const counts = results.reduce(
    (acc, item) => {
      const priceNum = parseFloat(item.price)
      const category =
        priceNum > 200 ? 'fire' :
        priceNum >= 40 ? 'star' :
        'trash'
      acc[category] = (acc[category] || 0) + 1
      return acc
    },
    { trash: 0, star: 0, fire: 0 } as Record<'trash' | 'star' | 'fire', number>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Search Form */}
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}
      >
        <input placeholder="Year" value={year} onChange={e => setYear(e.target.value)} required />
        <input placeholder="Make" value={make} onChange={e => setMake(e.target.value)} required />
        <input placeholder="Model" value={model} onChange={e => setModel(e.target.value)} required />
        <input placeholder="Details (opt.)" value={details} onChange={e => setDetails(e.target.value)} />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
	  
	  {/* Average Sold Price Display (ADDED) */}
      {averagePrice && (
        <div style={{ marginTop: '1rem', padding: '0.5rem 1rem', backgroundColor: '#f7f7f7', borderRadius: '8px', textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
          📈 Average Sold Price: ${averagePrice}
        </div>
      )}

      {/* Flip Summary */}
	  {!showActive && (		  
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem 1.25rem',
          backgroundColor: '#f0f0f0',
          borderRadius: '8px',
          textAlign: 'center',
          lineHeight: '1.5',
          fontSize: '1.1rem',
        }}>
          <strong style={{ fontSize: '1.2rem' }}>Flip Score:</strong><br />
          🔥 Fire Flips: {counts.fire}<br />
          ⭐ Solid Flips: {counts.star}<br />
          🗑️ Hardly Worth It: {counts.trash}
        </div>
	  )}

      {/* Fire Flips Only */}
      <label style={{ marginTop: '1rem', cursor: 'pointer', marginBottom: '1rem' }}>
        <input
          type="checkbox"
          checked={fireOnly}
          onChange={e => setFireOnly(e.target.checked)}
          style={{ marginRight: '0.5rem' }}
        />
        Show Fire Flips Only 🔥 (&gt;$200)
      </label>

      {/* Toggle for Active Listings */}
      <label style={{ cursor: 'pointer', marginBottom: '1rem' }}>
        <input
          type="checkbox"
          checked={showActive}
          onChange={() => setShowActive(!showActive)}
          style={{ marginRight: '0.5rem' }}
        />
        NEED PARTS FOR YOUR RIDE?! SELECT TO SHOW ACTIVE LISTINGS!! (via eBay Partner Network)
      </label>

      {/* Affiliate Disclaimer */}
      {showActive && (
        <p
          style={{
            fontSize: '0.75rem',
            color: '#888',
            maxWidth: '600px',
            marginBottom: '1rem',
            textAlign: 'center'
          }}
        >
          Disclaimer: When you click on links to various merchants on this site and make a purchase,
          this can result in this site earning a commission. Affiliate programs and affiliations
          include, but are not limited to, the eBay Partner Network.
        </p>
      )}

      {/* Results */}
      {loading && <p>Loading results…</p>}

      {results.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', padding: 0, width: '90%', maxWidth: '700px' }}>
            {results.map((item, i) => {
              const priceNum = parseFloat(item.price)
              const scoreEmoji = priceNum > 200 ? '🔥' : priceNum >= 40 ? '⭐' : '🗑️'
              const href = showActive
                ? `${item.link}${item.link.includes('?') ? '&' : '?'}`
                  + 'mkevt=1'
                  + '&mkcid=1'
                  + '&mkrid=711-53200-19255-0'
                  + `&campid=${process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID}`
                  + '&toolid=10001'
                : item.link



              return (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    borderBottom: '1px solid #eee',
                    paddingBottom: '0.75rem',
                  }}
                >
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.title}
                      width={64}
                      height={64}
                      style={{ objectFit: 'cover', marginRight: '1rem', borderRadius: '4px' }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: 600, color: '#0070f3', textDecoration: 'none' }}
                    >
                      {item.title}
                    </a>
                    <div style={{ marginTop: '0.25rem', color: '#333' }}>
                      {item.currency} {item.price}
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.9em', color: '#555' }}>
                      <strong>Flip Score:</strong> {scoreEmoji}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* See all on eBay */}
          <a
            href={showActive ? affiliateSearchUrl : soldSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginTop: '1rem', color: '#0070f3' }}
          >
            See all results on eBay →
          </a>
        </>
      )}
    </div>
  )
}
