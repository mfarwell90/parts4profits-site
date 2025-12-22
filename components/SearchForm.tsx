'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Item = {
  title: string
  price: string
  currency?: string
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
  const [metaInfo, setMetaInfo] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const [sortHigh, setSortHigh] = useState(false)
  const [fireOnly, setFireOnly] = useState(false)
  const [showActive, setShowActive] = useState(false) // false = SOLD mode, true = ACTIVE mode
  const [junkyard, setJunkyard] = useState(false)

  const haveSearched = rawResults.length > 0
  const lastQS = useRef<string>('')

  const derivedResults = useMemo(() => {
    let list = [...rawResults]

    // On site filters only apply to parsed ACTIVE results list
    // SOLD mode opens eBay directly (no parsing)
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

  useEffect(() => { setResults(derivedResults) }, [derivedResults])

  const averagePrice = useMemo(() => {
    if (showActive || results.length === 0) return null
    const total = results.reduce((sum, item) => sum + priceNum(item.price), 0)
    return (total / results.length).toFixed(2)
  }, [results, showActive])

  const runSearch = async (qs: URLSearchParams, active: boolean) => {
    qs.set('t', String(Date.now())) // cache bust
    const base = active ? '/api/search-active' : '/api/search'
    const endpoint = `${base}?${qs.toString()}`

    const res = await fetch(endpoint, { cache: 'no-store' })
    const data = await res.json()

    const items: Item[] = Array.isArray(data) ? data : (data?.items ?? [])
    setRawResults(Array.isArray(items) ? items : [])
    setMetaInfo(!Array.isArray(data) && data?.meta ? JSON.stringify(data.meta) : null)

    if (!Array.isArray(items) || items.length === 0) {
      const reason = (!Array.isArray(data) && (data?.meta?.reason as string)) || ''
      if (reason === 'bot_check') setMessage('eBay asked for a human check. Please retry in a moment.')
      else if (reason === 'empty_parse') setMessage('No results parsed for this query. Try refining it.')
      else if (reason === 'exception') setMessage('Something went wrong. Try again.')
      else setMessage('No results found for this query.')
    } else {
      setMessage(null)
    }
  }

  const rawQuery = `${year} ${make} ${model} ${details}`.trim()

  // SOLD search URL (opens in a new tab)
  const soldParams = new URLSearchParams({
    _nkw: rawQuery,
    LH_ItemCondition: '3000',
    LH_Sold: '1',
    LH_Complete: '1',
    _sop: '13'
  })
  if (junkyard) {
    soldParams.set('_udlo', '100')
    soldParams.set('_udhi', '400')
  }
  if (fireOnly) {
    // Approximation: Fire filter -> show sold listings at $300+
    soldParams.set('_udlo', '300')
  }
  const soldSearchUrl = `https://www.ebay.com/sch/6028/i.html?${soldParams.toString()}`

  // ACTIVE search URL (keeps affiliate behavior)
  const activeParams = new URLSearchParams({
    _nkw: rawQuery,
    LH_ItemCondition: '3000'
  })
  const activeSearchUrl = `https://www.ebay.com/sch/6028/i.html?${activeParams.toString()}`
  const affiliateSearchUrl =
    `https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=` +
    `${process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID}&toolid=10001&mpre=` +
    `${encodeURIComponent(activeSearchUrl)}`

  const openSold = () => {
    setSubmitted(true)
    setMessage(null)
    setMetaInfo(null)

    if (!year || !make || !model) {
      setMessage('Year, Make, and Model are required.')
      return
    }

    window.open(soldSearchUrl, '_blank', 'noopener,noreferrer')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setMessage(null)
    setMetaInfo(null)

    // ACTIVE stays on site with affiliate links
    if (showActive) {
      try {
        setLoading(true)
        const qs = new URLSearchParams({ year, make, model, details })
        qs.set('limit', '20')
        qs.set('junkyard', junkyard ? '1' : '0')
        lastQS.current = qs.toString()
        await runSearch(qs, true)
      } catch (err) {
        console.error('Search failed:', err)
        setMessage('Search failed. Try again.')
        setRawResults([])
        setResults([])
      } finally {
        setLoading(false)
      }
      return
    }

    // SOLD mode: open eBay directly
    openSold()
  }

  const retry = async () => {
    // Retry behaves correctly for both modes
    if (!showActive) {
      openSold()
      return
    }
    if (!lastQS.current) return
    setLoading(true)
    setMessage(null)
    try {
      await runSearch(new URLSearchParams(lastQS.current), true)
    } finally {
      setLoading(false)
    }
  }

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

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}
      >
        <input placeholder="Year" value={year} onChange={e => setYear(e.target.value)} required />
        <input placeholder="Make" value={make} onChange={e => setMake(e.target.value)} required />
        <input placeholder="Model" value={model} onChange={e => setModel(e.target.value)} required />
        <input placeholder="Details (opt.)" value={details} onChange={e => setDetails(e.target.value)} />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching…' : (showActive ? 'Search Active' : 'View Sold Results')}
        </button>
      </form>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <label style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showActive}
            onChange={() => {
              const next = !showActive
              setShowActive(next)
              setMessage(null)
              setMetaInfo(null)

              // When switching to SOLD mode, clear prior on site results so the sold view stays clean
              if (!next) {
                setRawResults([])
                setResults([])
              }
            }}
            style={{ marginRight: '0.5rem' }}
          />
          Show Active Listings
        </label>

        {(submitted || loading || showActive || haveSearched) && (
          <>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sortHigh}
                onChange={() => setSortHigh(!sortHigh)}
                style={{ marginRight: '0.5rem' }}
                disabled={!showActive}
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
                checked={junkyard}
                onChange={e => setJunkyard(e.target.checked)}
                style={{ marginRight: '0.5rem' }}
              />
              Junkyard Specialties $100–$400
            </label>
          </>
        )}
      </div>

      {/* Message */}
      {message && (
        <div style={{ marginTop: '0.75rem', opacity: 0.9, textAlign: 'center' }}>
          {message}{' '}
          <button onClick={retry} style={{ marginLeft: 8 }} disabled={loading}>
            Retry
          </button>
          {metaInfo && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer' }}>debug</summary>
              <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>{metaInfo}</pre>
            </details>
          )}
        </div>
      )}
      {loading && <p>Loading results…</p>}

      {/* SOLD MODE copy */}
      {!showActive && submitted && (
        <div
          style={{
            marginTop: '0.9rem',
            padding: '0.8rem 1.1rem',
            backgroundColor: 'var(--muted)',
            borderRadius: '8px',
            textAlign: 'center',
            lineHeight: 1.5,
            fontSize: '0.95rem',
            maxWidth: 720
          }}
        >
          Sold listings open directly on eBay for maximum accuracy and reliability.
          Your filters above still apply and will be included in the eBay search.
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={openSold}
              style={{
                padding: '0.55rem 0.95rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Open Sold Results on eBay →
            </button>
          </div>
        </div>
      )}

      {/* SOLD mode helper link always visible */}
      {!showActive && (
        <a
          href={soldSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginTop: '1rem', color: 'var(--link)' }}
        >
          Open sold results on eBay →
        </a>
      )}

      {/* ACTIVE VIEW disclaimer */}
      {showActive && submitted && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1.25rem',
            backgroundColor: 'var(--muted)',
            borderRadius: '8px',
            textAlign: 'center',
            lineHeight: 1.5,
            fontSize: '0.95rem',
            maxWidth: 720
          }}
        >
          <strong>DISCLAIMER:</strong> When you click on links to various merchants on this site and make a purchase, this can
          result in this site earning a commission. Affiliate programs and affiliations include, but are not limited to, the eBay Partner Network.
        </div>
      )}

      {/* ACTIVE results list
