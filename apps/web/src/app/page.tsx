'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
type EventSummary = { slug: string; name: string; venue: { name: string; city: string; region: string; country: string }; schedule: { timeZone: string; startDate: string; endDate: string } };

export default function HomePage() {
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`${API}/event`, { cache: 'no-store' }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error('Event details are temporarily unavailable.');
      setEvent(result.data.event as EventSummary);
    }).catch(() => setError('Event details are temporarily unavailable.'));
  }, []);
  const date = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: event?.schedule.timeZone || 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  const location = event ? [event.venue.name, event.venue.city, event.venue.region, event.venue.country].filter(Boolean).join(', ') : '';
  return <><SiteHeader /><main><section className="section"><div className="container"><div className="card event-hero"><p className="eyebrow">Celebrate Together</p><h1 className="event-hero__title">{event?.name ?? 'Festival Booking'}</h1>{event && <><p className="event-hero__description text-muted">Join us at {location}.</p><div className="event-hero__details"><p><strong>Dates:</strong> {date(event.schedule.startDate)} – {date(event.schedule.endDate)}</p><p><strong>Venue:</strong> {location}</p></div><div className="event-hero__actions"><Link href={`/events/${event.slug}`} className="button button-primary">Book passes</Link></div></>}{error && <p className="booking-error" role="alert">{error}</p>}</div></div></section></main><SiteFooter /></>;
}
