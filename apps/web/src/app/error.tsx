
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({
  error,
  reset,
}: ErrorPageProps) {
  useEffect(() => {
    // Send sanitized diagnostic information to your
    // configured error-monitoring service in production.
    // Avoid logging sensitive request or user data.
    if (process.env.NODE_ENV === 'development') {
      console.error('Application error:', error);
    }
  }, [error]);

  return (
    <main className="section">
      <div className="container">
        <section
          className="card"
          role="alert"
          aria-labelledby="error-title"
          style={{
            maxWidth: 640,
            margin: '64px auto',
            textAlign: 'center',
          }}
        >
          <p className="eyebrow">Unexpected error</p>

          <h1 id="error-title" style={{ marginBlock: 20 }}>
            Something went wrong.
          </h1>

          <p className="text-muted">
            We couldn't complete your request. You can try again
            or return to the homepage.
          </p>

          {error.digest && (
            <p className="text-muted">
              Reference: {error.digest}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 28,
            }}
          >
            <Button onClick={reset}>Try again</Button>

            <Link href="/" className="button button-secondary">
              Back to Home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
