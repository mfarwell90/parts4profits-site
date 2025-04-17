// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

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
      <body style={{ margin: 0, fontFamily: 'var(--font-inter)' }}>
        <header
          style={{
            padding: '1rem 0',
            textAlign: 'center',
            background: '#fafafa',
          }}
        >
          {/* Make sure your banner file is public/wmbanner.png */}
          <img
            src="/wmbanner.png"
            alt="Wrench Master Flip Finder"
            style={{ 
			  maxWidth: '1200px', 
			  height: 'auto',
              width: '40%',
              objectFit: 'cover',
			  margin: '0 auto',
			  }}
          />
        </header>

        <main style={{ padding: '1rem', textAlign: 'center' }}>
          {children}
        </main>

        <footer
          style={{
            padding: '1rem',
            borderTop: '1px solid #eee',
            textAlign: 'center',
            fontSize: '0.9em',
            color: '#666',
          }}
        >
          © {new Date().getFullYear()} Parts4Profits
        </footer>
      </body>
    </html>
  )
}
