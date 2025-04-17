import SearchForm from '../components/SearchForm'
import styles from './page.module.css'

export default function HomePage() {
  return (
    <main className={styles.main}>
      {/* Updated moto with Instagram link */}
      <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>
        Turning Scraps into Stacks – Follow{' '}
        <a
          href="https://www.instagram.com/wrench_master"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0070f3', textDecoration: 'none', fontWeight: 600 }}
        >
          @wrench_master
        </a>{' '}
        on Instagram
      </p>

      <SearchForm />
    </main>
  )
}
