import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';

// The app's name, as a wordmark. label: a word after the name, e.g. "Admin".
export function Logo({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="font-display font-semibold text-lg tracking-tight">{APP_NAME}</span>
      {label && (
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs">{label}</span>
      )}
    </span>
  );
}
