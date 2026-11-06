import { ChevronDown, MessageSquareText, Phone, PhoneForwarded } from 'lucide-react';
import { useState } from 'react';
import type { Call } from '@/api/owner';
import { Badge } from '@/components/ui/badge';
import { formatDay, formatDuration, formatPhone, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

// One call: who called, when, for how long, and what came of it. A call with a message opens to
// show it.
function CallRow({ call }: { call: Call }) {
  const [open, setOpen] = useState(false);
  const Icon = call.message ? MessageSquareText : call.transferred ? PhoneForwarded : Phone;
  const summary = (
    <>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          call.message?.urgent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium tabular-nums">
            {call.message?.caller_name ?? (call.caller ? formatPhone(call.caller) : 'Unknown caller')}
          </span>
          {call.message?.urgent && <Badge variant="destructive">Urgent</Badge>}
          {call.message && !call.message.urgent && <Badge variant="secondary">Message</Badge>}
          {call.transferred && <Badge variant="outline">Transferred</Badge>}
        </span>
        <span className="block truncate text-muted-foreground text-sm">
          {formatTime(call.started_at)} · {formatDuration(call.seconds)}
          {call.message && ` · ${call.message.message}`}
        </span>
      </span>
    </>
  );

  if (!call.message) return <div className="flex items-center gap-3 px-4 py-3 sm:px-5">{summary}</div>;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-5"
      >
        {summary}
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <dl className="mx-4 mb-4 grid gap-x-6 gap-y-0.5 rounded-lg bg-muted/50 p-4 text-sm sm:mx-5 sm:grid-cols-[auto_1fr] sm:gap-y-3">
          <dt className="pt-2.5 text-muted-foreground first:pt-0 sm:pt-0">Name</dt>
          <dd>{call.message.caller_name}</dd>
          <dt className="pt-2.5 text-muted-foreground first:pt-0 sm:pt-0">Call back on</dt>
          <dd>
            <a
              href={`tel:${call.message.callback_number}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {formatPhone(call.message.callback_number)}
            </a>
          </dd>
          <dt className="pt-2.5 text-muted-foreground first:pt-0 sm:pt-0">Message</dt>
          <dd className="whitespace-pre-wrap">{call.message.message}</dd>
          {call.caller && (
            <>
              <dt className="pt-2.5 text-muted-foreground first:pt-0 sm:pt-0">Called from</dt>
              <dd className="tabular-nums">{formatPhone(call.caller)}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

// Calls grouped under "Today", "Yesterday", and so on (newest first, as the API sends them).
export function CallList({ calls }: { calls: Call[] }) {
  const days: { day: string; calls: Call[] }[] = [];
  for (const call of calls) {
    const day = formatDay(call.started_at);
    if (days.at(-1)?.day !== day) days.push({ day, calls: [] });
    days.at(-1)?.calls.push(call);
  }
  return (
    <div className="flex flex-col">
      {days.map(({ day, calls: ofDay }) => (
        <section key={day} aria-label={day}>
          <h3 className="border-b bg-muted/30 px-4 py-2 font-medium text-muted-foreground text-xs sm:px-5">{day}</h3>
          <ul className="divide-y">
            {ofDay.map((call) => (
              <li key={call.id}>
                <CallRow call={call} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
