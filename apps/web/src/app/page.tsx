
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        <section className="section">
          <div className="container">
            <div
              className="card"
              style={{
                padding: 'clamp(28px, 7vw, 72px)',
                textAlign: 'center',
              }}
            >
              <p className="eyebrow">Celebrate Together</p>

              <h1
                style={{
                  maxWidth: 760,
                  margin: '20px auto',
                  fontSize: 'clamp(2.4rem, 6vw, 4.5rem)',
                }}
              >
                Sharad Utsav{' '}
                <span style={{ color: 'var(--color-bright-gold)' }}>
                  2026
                </span>
              </h1>

              <p
                className="text-muted"
                style={{
                  maxWidth: 600,
                  margin: '0 auto 28px',
                  fontSize: '1.05rem',
                }}
              >
                Join us for a celebration of culture, devotion,
                music, and community.
              </p>

              <p>November 10–14, 2026</p>

              <button
                className="button button-primary"
                type="button"
                disabled
              >
                Ticket booking coming soon
              </button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
