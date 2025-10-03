/* eslint-disable @typescript-eslint/no-unused-vars */
// app/components/SearchForm.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

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

const priceNum = (p?: string) => {
  const n = parseFloat(p || '')
  return Number.isFinite(n) ? n : 0
}

export default function SearchForm() {
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [details, setDetails] = useState('')

  const [rawResults, setRawResults] = useState<Item[]>([])
  const [results, setResults] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [sortHigh, setSortHigh] = useState(false)
  const [fireOnly, setFireOnly] = useState(false)
  const [showActive, setShowActive] = useState(false)
  const [junkyard, setJunkyard] = useState(false)

  const haveSearched = rawResults.length > 0

  const derivedResults = useMemo(() => {
    let list = [...rawResults]
    if (!showActive && junkyard) {
      list = list.filter(it => {
        const n = priceNum(it.price)
        return n >= 100 && n <= 400
      })
    }
    if (fireOnly) list = list.filter(it => priceNum(it.price) >= 300)
    if (sortHigh) list.sort((a, b) => priceNum(b.price) - priceNum(a.price))
    return list
  }, [rawResults, junkyard, fireOnly, sortHigh, showActive])

  useEffect(() => {
    setResults(derivedResults)
  }, [derivedResults])

  const averagePrice = useMemo(() => {
    if (showActive || results.length === 0) return null
    const total = results.reduce((sum, item) => sum + priceNum(item.price), 0)
    return (total / results.length).toFixed(2)
  }, [results, showActive])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const qs = new URLSearchParams({ year, make, model, details })
      qs.set('limit', '50')
      if (junkyard) qs.set('junkyard', '1')
      qs.set('t', String(Date.now())) // cache-bust

      const base = showActive ? '/api/search-active' : '/api/search'
      const endpoint = `${base}?${qs.toString()}`
      const res = await fetch(endpoint, { cache: 'no-store' })

      const data = await res.json()
      const items: Item[] = Array.isArray(data) ? data : (data?.items ?? [])

      if (!Array.isArray(items)) {
        setMessage('Unexpected response')
        setRawResults([])
        setResults([])
        return
      }

      const hadError = !Array.isArray(data) && data?.meta?.reason
      if (hadError) setMessage('Upstream is slow or rate limited. Try again or tweak your query.')

      setRawResults(items)
    } catch (err) {
      console.error('Search failed:', err)
      setMessage('Search failed. Try again.')
      setRawResults([])
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const rawQuery = `${year} ${make} ${model} ${details}`.trim()

  const soldParams = new URLSearchParams({
    _nkw: rawQuery,
    LH_ItemCondition: '3000',
    LH_Sold: '1',
    LH_Complete: '1'
  })
  if (junkyard) {
    soldParams.set('_udlo', '100')
    soldParams.set('_udhi', '400')
  }
  const soldSearchUrl = `https://www.ebay.com/sch/6028/i.html?${soldParams.toString()}`

  const activeParams = new URLSearchParams({
    _nkw: rawQuery,
    LH_ItemCondition: '3000'
  })
  const activeSearchUrl = `https://www.ebay.com/sch/6028/i.html?${activeParams.toString()}`
  const affiliateSearchUrl =
    `https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=` +
    `${process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID}&toolid=10001&mpre=` +
    `${encodeURIComponent(activeSearchUrl)}`

  const counts = results.reduce(
    (acc, item) => {
      const tier = getFlipTier(priceNum(item.price))
      acc[tier] = (acc[tier] || 0) + 1
      return acc
    },
    { Trash: 0, ThumbsUp: 0, Check: 0, Star: 0, Fire: 0 } as Record<FlipTier, number>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.95rem', color: 'var(--text)', textAlign: 'center' }}>
        🔥 $300+   •   ⭐ $151 - $300   •   ✔️ $76 - $150   •   👍 $16 - $75   •   🗑️ &lt;$15
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <input placeholder="Year" value={year} onChange={e => setYear(e.target.value)} required />
        <input placeholder="Make" value={make} onChange={e => setMake(e.target.value)} required />
        <input placeholder="Model" value={model} onChange={e => setModel(e.target.value)} required />
        <input placeholder="Details (opt.)" value={details} onChange={e => setDetails(e.target.value)} />
        <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <label style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={showActive} onChange={() => setShowActive(!showActive)} style={{ marginRight: '0.5rem' }} />
          Show Active Listings
        </label>

        {(haveSearched || loading) && (
          <>
            <label style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={sortHigh} onChange={() => setSortHigh(!sortHigh)} style={{ marginRight: '0.5rem' }} />
              Sort by Highest Price
            </label>
            <label style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={fireOnly} onChange={e => setFireOnly(e.target.checked)} style={{ marginRight: '0.5rem' }} />
              Show Fire Flips
            </label>
            <label style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={junkyard} onChange={e => setJunkyard(e.target.checked)} style={{ marginRight: '0.5rem' }} />
              Junkyard Specialties $100–$400
            </label>
          </>
        )}
      </div>

      {message && <div style={{ marginTop: '0.75rem', opacity: 0.8 }}>{message}</div>}
      {loading && <p>Loading results…</p>}

      {results.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', padding: 0, width: '90%', maxWidth: '700px' }}>
            {results.map((item, i) => {
              const tier = getFlipTier(priceNum(item.price))
              const href = showActive
                ? `${item.link}${item.link.includes('?') ? '&' : '?'}mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=${process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID}&toolid=10001`
                : item.link
              return (
                <li key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', background: 'var(--card)' }}>
                  {item.image && (<img src={item.image} alt={item.title} width={64} height={64} style={{ objectFit: 'cover', marginRight: '1rem', borderRadius: '4px' }} />)}
                  <div style={{ flex: 1 }}>
                    <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: 'var(--link)' }}>{item.title}</a>
                    <div style={{ marginTop: '0.25rem', color: 'var(--text)' }}>
                      {item.currency} {item.price} {item.soldDate ? <span style={{ opacity: 0.8 }}>• Sold {item.soldDate}</span> : null}
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '1rem' }}>{tierEmoji(tier)}</div>
                  </div>
                </li>
              )
            })}
          </ul>

          <a href={showActive ? affiliateSearchUrl : soldSearchUrl} target="_blank" rel="noopener noreferrer" style={{ marginTop: '1rem', color: 'var(--link)' }}>
            See all results on eBay →
          </a>
        </>
      )}
    </div>
  )
}
