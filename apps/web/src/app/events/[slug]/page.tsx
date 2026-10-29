import BookingFlow from '@/components/booking/BookingFlow';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';

export const instant = false;

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <><SiteHeader /><main><BookingFlow slug={slug} /></main><SiteFooter /></>;
}
