import { useMe } from '@/api/owner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { SetupWizard } from './setup-wizard';

// /setup: the wizard, filled in with the owner's business once they have one.
export function SetupPage() {
  const { data, isPending, error } = useMe();
  if (isPending) return <Skeleton className="mx-auto h-96 max-w-2xl" />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load your account: {error.message}</AlertDescription>
      </Alert>
    );
  }
  return <SetupWizard business={data.business} />;
}
