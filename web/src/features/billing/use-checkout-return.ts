import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useConfirmCheckout } from '@/api/owner';
import { planName } from './plan-format';

// Coming back from Stripe Checkout (?checkout=<session> on the dashboard or the plan page):
// confirms the payment and says what it bought, then calls clear() to drop the session from the
// address, so a reload doesn't confirm it again.
export function useCheckoutReturn(sessionId: string | undefined, clear: () => void) {
  const confirm = useConfirmCheckout();
  const started = useRef(false);
  useEffect(() => {
    if (!sessionId || started.current) return;
    started.current = true;
    confirm.mutate(sessionId, {
      onSuccess: ({ kind, added, needsPlan, plan }) => {
        if (kind === 'top_up') {
          if (added > 0) toast.success(`Added ${added.toLocaleString('en-US')} extra minutes.`);
          else toast.info('Your payment is being processed. The minutes are added once it goes through.');
        } else if (needsPlan) {
          toast.info('Your payment is still being processed. This page updates once it goes through.');
        } else {
          toast.success(`Payment received. You're on ${plan ? planName(plan) : 'your plan'}.`);
        }
      },
      onError: (err) => toast.error(`Could not confirm your payment: ${err.message}`),
      onSettled: clear,
    });
  }, [sessionId, confirm, clear]);
}
