'use client'

import { useMemo, useRef, useState } from 'react'

type Item = {
  title: string
  price: string
  link: string
}

type FlipTier = 'Trash' | 'ThumbsUp' | 'Check' | 'Star' | 'Fire'

function getFlipTier(p: number): FlipTier {
  if (p < 15) return 'Trash'
  if (p <= 75) return 'ThumbsUp'
  if (p <= 150) return 'Check'
  if (p <= 300) return 'Star'
  return 'Fire'
}

function priceNum(p?: string) {
  const n = parseFloat((p || '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function affiliate(link: string, campid: string) {
  if (!campid) return link
  return `https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=${campid}&toolid=10001&mpre=${encodeURIComponent(link)}`
}

export default function SearchForm() {
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [details, setDetails] = useState('')

  const [results, setResults] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const [showActive, setShowActive] = useState(false)
  const [fireOnly, setFireOnly] = useState(false)
  const [sortHigh, setSortHigh] = useState(false)
  const [junkyard, setJunkyard] = useState(false)

  const lastQS = useRef<string>('')

  const campaignId = process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID || ''

  const query = `${year} ${make} ${model} ${details}`.trim()

  // SOLD URL (direct to eBay)
  const soldParams = new URLSearchParams({
    _nkw: query,
    LH_Sold: '1',
    LH_Complete: '1',
    LH_ItemCondition: '3000',
    _sop: sortHigh ? '16' : '13'
  })

  if (junkyard) {
    soldParams.set('_udlo', '100')
    soldParams.set('_udhi', '400')
  }
  if (fireOnly) soldParams.set('_udlo', '300')

  const soldUrl = `https://www.ebay.com/sch/6028/i.html?${soldParams.toString()}`

  const runActive = async () => {
    try {
      setLoading(true)
      const qs = new URLSearchParams({ year, make, model, details })
      qs.set('limit', '20')
      lastQS.current = qs.toString()

      const res = await fetch(`/api/search-active?${qs.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      const items = Array.isArray(data) ? data : data.items || []

      setResults(items)
      setMessage(items.length ? null : 'No results found.')
    } catch {
      setMessage('Search failed.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setMessage(null)

    if (!year || !make || !model) {
      setMessage('Year, Make, and Model are required.')
      return
    }

    if (showActive) {
      await runActive()
    } else {
      window.open(soldUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const filtered = useMemo(() => {
    let list = [...results]
    if (fireOnly) list = list.filter(i => priceNum(i.price) >= 300)
    if (sortHigh) list.sort((a, b) => priceNum(b.price) - priceNum(a.price))
    return list
  }, [results, fireOnly, sortHigh])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginBottom: 8 }}>
        🔥 $300+ • ⭐ $151–$300 • ✔️ $76–$150 • 👍 $16–$75 • 🗑️ &lt;$15
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <input placeholder="Year" value={year} onChange={e => setYear(e.target.value)} required />
        <input placeholder="Make" value={make} onChange={e => setMake(e.target.value)} required />
        <input placeholder="Model" value={model} onChange={e => setModel(e.target.value)} required />
        <input placeholder="Details (optional)" value={details} onChange={e => setDetails(e.target.value)} />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching…' : showActive ? 'Search Active' : 'View Sold'}
        </button>
      </form>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <label>
          <input type="checkbox" checked={showActive} onChange={() => setShowActive(!showActive)} /> Active Listings
        </label>
        <label>
          <input type="checkbox" checked={fireOnly} onChange={e => setFireOnly(e.target.checked)} /> Fire Only
        </label>
        <label>
          <input type="checkbox" checked={sortHigh} onChange={e => setSortHigh(e.target.checked)} /> Sort High
        </label>
        <label>
          <input type="checkbox" checked={junkyard} onChange={e => setJunkyard(e.target.checked)} /> $100–$400
        </label>
      </div>

      {message && <div style={{ marginTop: 12 }}>{message}</div>}

      {showActive && submitted && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <strong>DISCLAIMER:</strong> This site may earn a commission via the eBay Partner Network.
        </div>
      )}

      {showActive && filtered.length > 0 && (
        <div style={{ width: '100%', maxWidth: 900, marginTop: 16 }}>
          {filtered.map((item, i) => {
            const p = priceNum(item.price)
            const tier = getFlipTier(p)
            return (
              <div key={i} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <a href={affiliate(item.link, campaignId)} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
                <div>{tier} • ${p.toFixed(2)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}