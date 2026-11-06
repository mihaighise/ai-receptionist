import { Phone } from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';

// The app's mark and name. label: a word after the name, e.g. "Admin".
export function Logo({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-sm ring-1 ring-primary/20">
        <Phone className="size-4" strokeWidth={2.25} />
      </span>
      <span className="font-semibold tracking-tight">{APP_NAME}</span>
      {label && (
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs">{label}</span>
      )}
    </span>
  );
}
