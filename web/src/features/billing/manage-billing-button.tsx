import { CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBillingPortal } from '@/api/owner';
import { Button } from '@/components/ui/button';

// Opens Stripe's billing page: change plan or card, see invoices, cancel.
export function ManageBillingButton({ variant = 'outline' }: { variant?: 'outline' | 'default' }) {
  const portal = useBillingPortal();
  const busy = portal.isPending || portal.isSuccess;
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={busy}
      onClick={() => portal.mutate(undefined, { onError: (err) => toast.error(err.message) })}
    >
      {busy ? <Loader2 className="animate-spin" /> : <CreditCard />} Manage billing
    </Button>
  );
}
