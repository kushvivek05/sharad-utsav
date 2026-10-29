
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="section">
      <div className="container">
        <section
          className="card"
          style={{
            maxWidth: 640,
            margin: '64px auto',
            padding: 'clamp(28px, 6vw, 56px)',
            textAlign: 'center',
          }}
        >
          <p className="eyebrow">Page Not Found</p>

          <h1
            style={{
              marginBlock: 20,
              fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            }}
          >
            This path leads nowhere.
          </h1>

          <p className="text-muted">
            The page may have moved or the address may be incorrect.
            Return to the Sharad Utsav homepage to continue.
          </p>

          <div style={{ marginTop: 28 }}>
            <Link href="/" className="button button-primary">
              Back to Home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
