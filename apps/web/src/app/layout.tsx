
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Festival booking',
    template: '%s | Festival booking',
  },
  description:
    'Book tickets and extras for the festival.',
  applicationName: 'Sharad Utsav',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
