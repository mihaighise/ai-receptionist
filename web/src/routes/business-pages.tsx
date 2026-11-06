import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Building2 } from 'lucide-react';
import { useBusinesses } from '@/api/businesses';
import { Skeleton } from '@/components/ui/skeleton';
import { BusinessForm } from '@/features/businesses/business-form';

// Only shown on phones, where the list and the form don't fit side by side.
function BackToList() {
  return (
    <Link to="/" className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm md:hidden">
      <ArrowLeft className="size-4" /> All businesses
    </Link>
  );
}

export function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-24 text-center">
      <Building2 className="size-8 text-muted-foreground" />
      <p className="font-medium">Pick a business, or add a new one.</p>
      <p className="text-muted-foreground text-sm">Each business answers calls on its own Twilio number.</p>
    </div>
  );
}

export function NewBusinessPage() {
  return (
    <>
      <BackToList />
      <BusinessForm business={null} />
    </>
  );
}

export function EditBusinessPage() {
  const { businessId } = useParams({ from: '/businesses/$businessId' });
  const { data: businesses, isPending } = useBusinesses();
  const business = businesses?.find((b) => b.id === businessId);

  if (isPending) return <Skeleton className="h-96" />;
  return (
    <>
      <BackToList />
      {business ? (
        <BusinessForm key={business.id} business={business} />
      ) : (
        <p className="text-muted-foreground">This business doesn't exist anymore.</p>
      )}
    </>
  );
}
