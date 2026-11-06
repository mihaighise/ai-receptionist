import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  ArrowRight,
  CalendarCheck,
  Check,
  CreditCard,
  Languages,
  MessageSquareText,
  PhoneCall,
  PhoneForwarded,
  Settings,
} from 'lucide-react';
import { type ReactNode, useCallback } from 'react';
import type { Business } from '@/api/businesses';
import { type Billing, useCalendar, useMe } from '@/api/owner';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ManageBillingButton } from '@/features/billing/manage-billing-button';
import { formatDate, planName } from '@/features/billing/plan-format';
import { UsageMeter, usageLevel } from '@/features/billing/usage-meter';
import { useCheckoutReturn } from '@/features/billing/use-checkout-return';
import { RecentCalls } from '@/features/calls/recent-calls';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Spanish' };

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

type Status = { tone: 'live' | 'todo' | 'off'; label: string; detail: string };

// Whether calls are answered: paused by us, waiting for a plan or a number, or live.
function statusOf(business: Business, billing: Billing | null): Status {
  if (!business.active) {
    return { tone: 'off', label: 'Paused', detail: 'Your receptionist is paused. Contact us to turn it back on.' };
  }
  if (billing?.needsPlan) {
    return {
      tone: 'todo',
      label: 'Choose a plan to go live',
      detail:
        billing.status === 'canceled'
          ? `Your plan has ended, so calls are not being answered.${
              billing.numberReleasesAt && business.twilio_number
                ? ` Your number ${formatPhone(business.twilio_number)} is kept until ${formatDate(billing.numberReleasesAt)}; choose a plan before then to keep it.`
                : ''
            }`
          : 'Your receptionist is ready. It starts answering calls once you choose a plan.',
    };
  }
  if (billing && usageLevel(billing.usage) === 'out') {
    return {
      tone: 'todo',
      label: 'Out of minutes',
      detail: "You've used this month's minutes, so new calls aren't answered. Buy extra minutes or upgrade your plan.",
    };
  }
  if (!business.twilio_number) {
    return { tone: 'todo', label: 'Waiting for a phone number', detail: "We're getting a phone number ready for you." };
  }
  return {
    tone: 'live',
    label: 'Answering calls',
    detail: `Callers to ${formatPhone(business.twilio_number)} reach your receptionist, day and night.`,
  };
}

function StatusDot({ tone }: { tone: Status['tone'] }) {
  return (
    <span className="relative flex size-3">
      {tone === 'live' && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
      )}
      <span
        className={cn(
          'relative inline-flex size-3 rounded-full',
          tone === 'live' ? 'bg-success' : tone === 'todo' ? 'bg-warning' : 'bg-muted-foreground',
        )}
      />
    </span>
  );
}

// The steps to going live, ticked off as they're done.
function Checklist({ business, billing }: { business: Business | null; billing: Billing | null }) {
  const steps: { label: string; done: boolean; hint?: string; action?: ReactNode }[] = [
    {
      label: 'Set up your receptionist',
      done: Boolean(business),
      action: !business && (
        <Button size="sm" asChild>
          <Link to="/setup">
            Get started <ArrowRight />
          </Link>
        </Button>
      ),
    },
    {
      label: billing?.status === 'canceled' ? 'Your plan has ended' : 'Choose a plan',
      done: Boolean(business) && !billing?.needsPlan,
      action: business && billing?.needsPlan && (
        <Button size="sm" asChild>
          <Link to="/plan">
            See plans <ArrowRight />
          </Link>
        </Button>
      ),
    },
    {
      label: 'Get your phone number',
      done: Boolean(business?.twilio_number),
      hint: business && !billing?.needsPlan && !business.twilio_number ? "We'll set it up for you." : undefined,
    },
  ];
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-3 border-t py-3 first:border-t-0">
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full border font-medium text-xs',
              step.done ? 'border-success bg-success text-white dark:text-background' : 'text-muted-foreground',
            )}
          >
            {step.done ? <Check className="size-4" /> : index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('block font-medium text-sm', step.done && 'text-muted-foreground line-through')}>
              {step.label}
            </span>
            {step.hint && <span className="block text-muted-foreground text-xs">{step.hint}</span>}
          </span>
          {step.action}
        </li>
      ))}
    </ol>
  );
}

function StatusCard({ business, billing }: { business: Business; billing: Billing | null }) {
  const status = statusOf(business, billing);
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div
        className={cn(
          'flex items-start gap-4 p-5 sm:p-6',
          status.tone === 'live' && 'bg-success-soft/60',
          status.tone === 'todo' && 'bg-warning-soft/60',
        )}
      >
        <div className="pt-2">
          <StatusDot tone={status.tone} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-lg">{status.label}</p>
          <p className="text-muted-foreground text-sm">{status.detail}</p>
        </div>
      </div>
      {status.label === 'Out of minutes' ? (
        <CardContent className="border-t px-5 py-4 sm:px-6">
          <Button size="sm" asChild>
            <Link to="/plan">
              Buy extra minutes <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      ) : (
        status.tone === 'todo' && (
          <CardContent className="border-t px-5 py-1 sm:px-6">
            <Checklist business={business} billing={billing} />
          </CardContent>
        )
      )}
    </Card>
  );
}

function InfoCard({
  icon,
  label,
  children,
  action,
  wide = false,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  action?: ReactNode;
  // Takes the full width on phones, where the other cards sit two to a row.
  wide?: boolean;
}) {
  return (
    <Card className={cn('py-5', wide && 'col-span-2 sm:col-span-1')}>
      <CardContent className="flex h-full flex-col gap-3 px-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            {icon}
          </span>
          {label}
        </div>
        <div className="min-w-0">{children}</div>
        {action && <div className="mt-auto pt-1">{action}</div>}
      </CardContent>
    </Card>
  );
}

function PlanInfo({ business, billing }: { business: Business; billing: Billing | null }) {
  const icon = <CreditCard className="size-4" />;
  // Businesses added in the admin site don't need a plan.
  if (!billing || (!business.requires_subscription && !billing.plan)) {
    return (
      <InfoCard wide icon={icon} label="Plan">
        <p className="font-semibold text-lg">Included</p>
      </InfoCard>
    );
  }
  if (billing.needsPlan) {
    return (
      <InfoCard
        icon={icon}
        label="Plan"
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/plan">See plans</Link>
          </Button>
        }
      >
        <p className="font-semibold text-lg">{billing.status === 'canceled' ? 'Ended' : 'No plan yet'}</p>
      </InfoCard>
    );
  }
  return (
    <InfoCard wide icon={icon} label="Plan" action={<ManageBillingButton />}>
      <p className="font-semibold text-lg">{billing.plan ? planName(billing.plan) : 'Included'}</p>
      {billing.periodEnd && (
        <p className="text-muted-foreground text-sm">
          {billing.cancels ? `Ends on ${formatDate(billing.periodEnd)}` : `Renews on ${formatDate(billing.periodEnd)}`}
        </p>
      )}
    </InfoCard>
  );
}

// This month's minutes, with a warning once 80% are used.
function MinutesCard({ billing }: { billing: Billing }) {
  const level = usageLevel(billing.usage);
  return (
    <Card className="py-5">
      <CardContent className="flex flex-col gap-4 px-5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold">Minutes this month</h2>
          <Button size="sm" variant="outline" asChild>
            <Link to="/plan">Buy minutes</Link>
          </Button>
        </div>
        <UsageMeter usage={billing.usage} />
        {level === 'low' && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
            You've used most of this month's minutes. Buy extra minutes or upgrade so calls keep being answered.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Booking appointments, and a nudge to connect the calendar until it is: bookings wait for it.
function BookingsLine({ business }: { business: Business }) {
  const calendar = useCalendar();
  const services = (business.booking_settings.services ?? []).map((s) => s.name).join(', ');
  return (
    <li className="flex flex-wrap items-center gap-x-1.5">
      Books appointments <CalendarCheck className="size-3.5 text-muted-foreground" />
      {services && <span className="text-muted-foreground">→ {services}</span>}
      {calendar.data && !calendar.data.connected && (
        <Link to="/setup" className="w-full text-primary text-xs underline-offset-4 hover:underline">
          Connect your calendar to start booking
        </Link>
      )}
    </li>
  );
}

function Overview({ business, billing }: { business: Business; billing: Billing | null }) {
  const sendsTo = [
    business.notify_sms && `${formatPhone(business.notify_sms)} by text`,
    business.notify_whatsapp && `${formatPhone(business.notify_whatsapp)} on WhatsApp`,
  ].filter(Boolean);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <InfoCard icon={<PhoneCall className="size-4" />} label="Number callers dial">
        <p className={cn('font-semibold text-lg', !business.twilio_number && 'text-muted-foreground')}>
          {business.twilio_number ? formatPhone(business.twilio_number) : 'Not assigned yet'}
        </p>
      </InfoCard>
      <InfoCard icon={<Languages className="size-4" />} label="Speaks">
        <p className="font-semibold text-lg">
          {business.languages.map((code) => LANGUAGE_NAMES[code] ?? code).join(' and ')}
        </p>
      </InfoCard>
      <PlanInfo business={business} billing={billing} />
      <InfoCard wide icon={<MessageSquareText className="size-4" />} label="What it does">
        <ul className="flex flex-col gap-1 text-sm">
          <li>Answers questions</li>
          {business.features.includes('messages') && (
            <li className="break-words">
              Takes messages
              {sendsTo.length > 0 && <span className="text-muted-foreground"> → {sendsTo.join(', ')}</span>}
            </li>
          )}
          {business.features.includes('bookings') && <BookingsLine business={business} />}
          {business.features.includes('transfers') && (
            <li className="flex items-center gap-1.5">
              Transfers calls <PhoneForwarded className="size-3.5 text-muted-foreground" />
            </li>
          )}
        </ul>
      </InfoCard>
    </div>
  );
}

// What an owner sees after signing in: how their receptionist is doing, what's left to go live,
// and its number, languages, plan and actions. Call history comes next.
export function DashboardPage() {
  const { data, isPending, error } = useMe();
  const { checkout } = useSearch({ from: '/owner/' });
  const navigate = useNavigate();
  const clearCheckout = useCallback(() => navigate({ to: '/', search: {}, replace: true }), [navigate]);
  useCheckoutReturn(checkout, clearCheckout);

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-36" />
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load your account: {error.message}</AlertDescription>
      </Alert>
    );
  }

  const { user, business, billing } = data;
  const title = `${greeting()}, ${user.name.split(' ')[0]}`;

  if (!business) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title={title} description="Let's get your AI receptionist answering calls." />
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b bg-gradient-to-br from-accent to-transparent p-6 sm:p-8">
            <h2 className="font-semibold text-xl tracking-tight">Let's set up your receptionist</h2>
            <p className="mt-1 max-w-xl text-muted-foreground">
              Tell it about your business, the languages it speaks and what it should do with calls. It takes about five
              minutes.
            </p>
          </div>
          <CardContent className="px-6 py-1 sm:px-8">
            <Checklist business={null} billing={null} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={business.name}
        actions={
          <Button variant="outline" asChild>
            <Link to="/setup">
              <Settings /> Edit settings
            </Link>
          </Button>
        }
      />
      {billing?.status === 'past_due' && (
        <Alert variant="destructive">
          <AlertDescription>
            Your last payment didn't go through. Update your card under Manage billing to keep your receptionist
            answering calls.
          </AlertDescription>
        </Alert>
      )}
      <StatusCard business={business} billing={billing} />
      {billing?.usage.limited && !billing.needsPlan && <MinutesCard billing={billing} />}
      <Overview business={business} billing={billing} />
      <RecentCalls />
    </div>
  );
}
