import { useNumberOrder } from '@/api/businesses';
import { cn } from '@/lib/utils';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// The latest automatic Twilio number order for a business, next to its Twilio number: owners'
// businesses get one when their plan is paid for (TWILIO_BUY_NUMBERS: dry run unless set to live).
export function NumberOrderStatus({ businessId }: { businessId: string }) {
  const { data: order } = useNumberOrder(businessId);
  if (!order) return null;
  const area = order.area_code ? `area code ${order.area_code}` : 'any US area code';
  const text = {
    dry_run: `Dry run: would have bought a number in ${area}. Nothing was bought.`,
    buying: `Buying a number in ${area}…`,
    bought: order.release_error
      ? `Bought ${order.phone_number} automatically. Releasing it failed: ${order.release_error}. It's tried again every hour.`
      : `Bought ${order.phone_number} automatically.`,
    released: `Released ${order.phone_number} after the plan ended.`,
    failed: `Could not buy a number: ${order.error}. It's tried again on the next payment event.`,
  }[order.status];
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-medium text-sm">Automatic number</p>
      <p
        className={cn(
          'rounded-md border px-3 py-2 text-sm',
          order.status === 'failed' || order.release_error
            ? 'border-destructive/40 text-destructive'
            : 'text-muted-foreground',
        )}
      >
        {text} <span className="text-xs">({when(order.created_at)})</span>
      </p>
    </div>
  );
}
