
'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({
  error,
  reset,
}: GlobalErrorProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Root application error:', error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#2C2C2C',
          color: '#FFFFFF',
          fontFamily: 'Arial, sans-serif',
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: 560 }}>
          <p style={{ color: '#D1AC3E' }}>
            SHARAD UTSAV 2026
          </p>

          <h1>We're having technical difficulties.</h1>

          <p>
            The application encountered an unexpected error.
            Please try again.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: '12px 20px',
              border: 0,
              borderRadius: 10,
              background: '#C99B24',
              color: '#291900',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
