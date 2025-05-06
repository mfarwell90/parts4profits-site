'use client'

import { useState } from 'react'

export default function ProfitCalculator() {
  const [purchasePrice, setPurchasePrice] = useState('')
  const [soldPrice, setSoldPrice] = useState('')
  const [shippingCost, setShippingCost] = useState('')
  const [fees, setFees] = useState('')

  const calculateProfit = () => {
    const purchase = parseFloat(purchasePrice) || 0
    const sold = parseFloat(soldPrice) || 0
    const shipping = parseFloat(shippingCost) || 0
    const fee = parseFloat(fees) || 0

    return (sold - purchase - shipping - fee).toFixed(2)
  }

  const profit = calculateProfit()

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: 'auto', textAlign: 'center' }}>
      <h1 style={{ marginBottom: '1rem' }}>🧮 Profit Calculator</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input
          type="number"
          placeholder="Purchase Price"
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />

        <input
          type="number"
          placeholder="Sold Price"
          value={soldPrice}
          onChange={(e) => setSoldPrice(e.target.value)}
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />

        <input
          type="number"
          placeholder="Shipping Cost"
          value={shippingCost}
          onChange={(e) => setShippingCost(e.target.value)}
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />

        <input
          type="number"
          placeholder="Fees (eBay, PayPal, etc.)"
          value={fees}
          onChange={(e) => setFees(e.target.value)}
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />
      </div>

      <div style={{ marginTop: '2rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
        {profit.startsWith('-') ? '💸 Loss: ' : '💰 Profit: '}
        ${Math.abs(parseFloat(profit)).toFixed(2)}
      </div>
    </div>
  )
}
