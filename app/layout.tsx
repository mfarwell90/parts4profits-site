// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Parts4Profits',
  description: 'Turning scraps into stacks',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body style={{ margin: 0, fontFamily: 'var(--font-inter)', background: 'var(--bg)', color: 'var(--text)' }}>
        <header
          style={{
            padding: '1rem 0',
            textAlign: 'center',
            background: 'var(--card)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <img
            src="/wmbanner.png"
            alt="Wrench Master Flip Finder"
            style={{
              maxWidth: '100%',
              width: '480px',
              height: 'auto',
              objectFit: 'cover',
              margin: '0 auto',
              display: 'block',
            }}
          />

          <nav style={{ marginTop: '1rem', fontSize: '1rem' }}>
            <Link href="/" style={{ margin: '0 0.5rem', color: 'var(--link)', textDecoration: 'underline' }}>
              Home
            </Link>
            <span style={{ color: 'var(--text)' }}>·</span>
            <Link href="/profit-calculator" style={{ margin: '0 0.5rem', color: 'var(--link)', textDecoration: 'underline' }}>
              Profit Calculator
            </Link>
          </nav>
        </header>

        <main style={{ padding: '1rem', textAlign: 'center' }}>
          {children}
        </main>

        <footer
          style={{
            padding: '1rem',
            borderTop: '1px solid var(--border)',
            textAlign: 'center',
            fontSize: '0.9em',
            color: 'var(--text)',
            background: 'var(--card)',
          }}
        >
          © {new Date().getFullYear()} Parts4Profits
        </footer>
      </body>
    </html>
  )
}
