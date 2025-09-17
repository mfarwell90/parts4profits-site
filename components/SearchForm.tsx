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

type FlipTier = 'Trash' | 'ThumbsUp' | 'Check' | 'Star' | 'Fire'

function getFlipTier(priceNum: number): FlipTier {
  if (priceNum < 15) return 'Trash'
  if (priceNum <= 75) return 'ThumbsUp'
  if (priceNum <= 150) return 'Check'
  if (priceNum <= 300) return 'Star'
  return 'Fire'
}

function tierEmoji(tier: FlipTier) {
  switch (tier) {
    case 'Trash': return '🗑️'
    case 'ThumbsUp': return '👍'
    case 'Check': return '✔️'
    case 'Star': return '⭐'
    case 'Fire': return '🔥'
  }
}

export default function SearchForm() {
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [details, setDetails] = useState('')

  const [results, setResults] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)

  // all unchecked by default
  const [sortHigh, setSortHigh] = useState(false)
  const [fireOnly, setFireOnly] = useState(false)
  const [showActive, setShowActive] = useState(false)

  // new single checkbox
  const [junkyard, setJunkyard] = useState(false) // $100–$400

  const [averagePrice, setAveragePrice] = useState<string | null>(null)

  const calculateAverage = (listings: Item[]) => {
    if (!listings.length) return '0.00'
    const total = listings.reduce((sum, item) => sum + parseFloat(item.price), 0)
    return (total / listings.length).toFixed(2)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const qs = new URLSearchParams({ year, make, model, details })
      qs.set('limit', '30') // default 30 results with images

      if (junkyard) qs.set('junkyard', '1')

      const endpoint = showActive ? `/api/search-active?${qs.toString()}` : `/api/search?${qs.toString()}`

      const res = await fetch(endpoint)
      if (!res.ok) {
        console.error('API error:', await res.text())
        setResults([])
        setAveragePrice(null)
        return
      }

      const json = await res.json()
      if (!Array.isArray(json)) {
        console.error('Unexpected API result:', json)
        setResults([])
        setAveragePrice(null)
        return
      }

      let data: Item[] = json

      if (fireOnly) {
        data = data.filter(it => (parseFloat(it.price) || 0) >= 300)
      }

      if (sortHigh) {
        data = [...data].sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0))
      }

      setResults(data)
      setAveragePrice(showActive ? null : calculateAverage(data))
    } catch (err) {
      console.error('Search failed:', err)
      setResults([])
      setAveragePrice(null)
    } finally {
      setLoading(false)
    }
  }

  const rawQuery = `${year} ${make} ${model} ${details}`.trim()

  // Build the eBay URLs for the "See all results" link
  const soldParams = new URLSearchParams({
    _nkw: rawQuery,
    sacat: '6028',
    _dcat: '6028',
    LH_ItemCondition: '3000',
    LH_Sold: '1',
    LH_Complete: '1'
  })
  if (junkyard) {
    soldParams.set('_udlo', '100')
    soldParams.set('_udhi', '400')
  }
  const soldSearchUrl = `https://www.ebay.com/sch/i.html?${soldParams.toString()}`

  const activeParams = new URLSearchParams({ _nkw: rawQuery })
  const activeSearchUrl = `https://www.ebay.com/sch/i.html?${activeParams.toString()}`

  const affiliateSearchUrl =
    `https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=` +
    `${process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID}&toolid=10001&mpre=` +
    `${encodeURIComponent(activeSearchUrl)}`

  const counts = results.reduce(
    (acc, item) => {
      const priceNum = parseFloat(item.price) || 0
      const tier = getFlipTier(priceNum)
      acc[tier] = (acc[tier] || 0) + 1
      return acc
    },
    { Trash: 0, ThumbsUp: 0, Check: 0, Star: 0, Fire: 0 } as Record<FlipTier, number>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* legend above the search, emoji only */}
      <div style={{ marginBottom: '0.5rem', fontSize: '0.95rem', color: 'var(--text)', textAlign: 'center' }}>
        🔥 $300+   •   ⭐ $151 - $300   •   ✔️ $76 - $150   •   👍 $16 - $75   •   🗑️ &lt;$15
      </div>

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

      {/* centered controls */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <label style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={sortHigh}
            onChange={() => setSortHigh(!sortHigh)}
            style={{ marginRight: '0.5rem' }}
          />
          Sort by Highest Price
        </label>

        <label style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={fireOnly}
            onChange={e => setFireOnly(e.target.checked)}
            style={{ marginRight: '0.5rem' }}
          />
          Show Fire Flips
        </label>

        <label style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showActive}
            onChange={() => setShowActive(!showActive)}
            style={{ marginRight: '0.5rem' }}
          />
          Show Active Listings
        </label>

        <label style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={junkyard}
            onChange={e => setJunkyard(e.target.checked)}
            style={{ marginRight: '0.5rem' }}
          />
          Junkyard Specialties $100–$400
        </label>
      </div>

      {!showActive && averagePrice && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--muted)',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '1.2rem',
            fontWeight: 'bold'
          }}
        >
          📈 Average Sold Price: ${averagePrice}
        </div>
      )}

      {/* totals with emoji only */}
      {!showActive && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1.25rem',
            backgroundColor: 'var(--muted)',
            borderRadius: '8px',
            textAlign: 'center',
            lineHeight: 1.5,
            fontSize: '1.05rem'
          }}
        >
          🔥 {counts.Fire}  •  ⭐ {counts.Star}  •  ✔️ {counts.Check}  •  👍 {counts.ThumbsUp}  •  🗑️ {counts.Trash}
        </div>
      )}

      {loading && <p>Loading results…</p>}

      {results.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', padding: 0, width: '90%', maxWidth: '700px' }}>
            {results.map((item, i) => {
              const priceNum = parseFloat(item.price) || 0
              const tier = getFlipTier(priceNum)
              const href = showActive
                ? `${item.link}${item.link.includes('?') ? '&' : '?'}mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=${process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID}&toolid=10001`
                : item.link

              return (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '0.75rem',
                    background: 'var(--card)'
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
                      style={{ fontWeight: 600, color: 'var(--link)' }}
                    >
                      {item.title}
                    </a>
                    <div style={{ marginTop: '0.25rem', color: 'var(--text)' }}>
                      {item.currency} {item.price}{' '}
                      {item.soldDate ? <span style={{ opacity: 0.8 }}>• Sold {item.soldDate}</span> : null}
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '1rem' }}>
                      {tierEmoji(tier)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <a
            href={showActive ? affiliateSearchUrl : soldSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginTop: '1rem', color: 'var(--link)' }}
          >
            See all results on eBay →
          </a>
        </>
      )}
    </div>
  )
}
