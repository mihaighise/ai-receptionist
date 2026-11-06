import type { Usage } from '@/api/owner';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatDate } from './plan-format';

const minutes = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'minute' : 'minutes'}`;

// How full this month is: 'ok', 'low' (80% of the plan's minutes used) or 'out' (no minutes left,
// so new calls aren't answered). Businesses without a limit are always 'ok'.
export function usageLevel(usage: Usage): 'ok' | 'low' | 'out' {
  if (!usage.limited) return 'ok';
  if (usage.remaining <= 0) return 'out';
  if (usage.planMinutes > 0 && usage.used >= usage.planMinutes * 0.8 && usage.extra < usage.planMinutes * 0.2) {
    return 'low';
  }
  return 'ok';
}

// "123 of 600 minutes used" with a bar, the extra minutes, and when the month resets.
export function UsageMeter({ usage, className }: { usage: Usage; className?: string }) {
  const level = usageLevel(usage);
  const percent = usage.planMinutes ? Math.min(100, (usage.used / usage.planMinutes) * 100) : 100;
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p>
          <span className="font-semibold text-2xl tabular-nums tracking-tight">
            {usage.used.toLocaleString('en-US')}
          </span>
          <span className="text-muted-foreground"> of {minutes(usage.planMinutes)} used</span>
        </p>
        {usage.periodEnd && <p className="text-muted-foreground text-xs">Resets on {formatDate(usage.periodEnd)}</p>}
      </div>
      <Progress
        value={percent}
        aria-label="Plan minutes used this month"
        className="h-2.5 bg-muted"
        indicatorClassName={cn(level === 'out' ? 'bg-destructive' : level === 'low' ? 'bg-warning' : 'bg-primary')}
      />
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          {minutes(Math.max(0, usage.planMinutes - usage.used))} left this month
        </span>
        {usage.extra > 0 && <span className="font-medium">+ {minutes(usage.extra)} extra</span>}
      </div>
    </div>
  );
}
