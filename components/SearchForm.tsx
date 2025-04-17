// components/SearchForm.tsx
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const qs = new URLSearchParams({ year, make, model, details })
      const res = await fetch(`/api/search?${qs.toString()}`)
      let data: Item[] = await res.json()
      if (fireOnly) data = data.filter((it) => parseFloat(it.price) > 200)
      setResults(data)
    } finally {
      setLoading(false)
    }
  }

  // Build the “see all” URL
  const rawQuery = `${year} ${make} ${model} ${details}`.trim()
  const ebayUrl =
    `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(rawQuery)}` +
    `&LH_Sold=1&LH_Complete=1&LH_ItemCondition=3000`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Search Form */}
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}
      >
        <input placeholder="Year"       value={year}    onChange={e => setYear(e.target.value)}    required />
        <input placeholder="Make"       value={make}    onChange={e => setMake(e.target.value)}    required />
        <input placeholder="Model"      value={model}   onChange={e => setModel(e.target.value)}   required />
        <input placeholder="Details (opt.)" value={details} onChange={e => setDetails(e.target.value)} />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Flip Score Legend */}
      <p style={{ marginTop: '1rem', fontSize: '0.9em', color: '#555' }}>
        <strong>Flip Score:</strong>{' '}
		{'🔥 > $200'},{' '}
		{⭐ $40–$199.99'},{' '}
		{🗑️ ≤ $39.99'}
      </p>

      {/* Fire Flips Only */}
      <label style={{ cursor: 'pointer', marginBottom: '1rem' }}>
        <input
          type="checkbox"
          checked={fireOnly}
          onChange={e => setFireOnly(e.target.checked)}
          style={{ marginRight: '0.5rem' }}
        />
        Show Fire Flips Only 🔥 (>$200)
      </label>

      {/* Results */}
      {loading && <p>Loading results…</p>}

      {results.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', padding: 0, width: '90%', maxWidth: '700px' }}>
            {results.map((item, i) => {
              const priceNum = parseFloat(item.price)
              const scoreEmoji = priceNum > 200 ? '🔥' : priceNum >= 40 ? '⭐' : '🗑️'

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
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: 600, color: '#0070f3', textDecoration: 'none' }}
                    >
                      {item.title}
                    </a>
                    <div style={{ marginTop: '0.25rem', color: '#333' }}>
                      {item.currency} {item.price}
                    </div>
                    {/* New Flip Score line */}
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
            href={ebayUrl}
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
