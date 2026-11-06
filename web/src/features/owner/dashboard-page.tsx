import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CreditCard,
  Languages,
  PhoneCall,
  Settings,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { Business } from '@/api/businesses';
import { type Billing, useConfirmCheckout, useMe } from '@/api/owner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ManageBillingButton } from '@/features/billing/manage-billing-button';
import { formatDate, planName } from '@/features/billing/plan-format';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Spanish' };

// "+18312490526" -> "+1 (831) 249-0526"; other countries are shown as stored.
const formatNumber = (number: string) =>
  /^\+1\d{10}$/.test(number) ? `+1 (${number.slice(2, 5)}) ${number.slice(5, 8)}-${number.slice(8)}` : number;

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="font-medium">{children}</div>
      </div>
    </div>
  );
}

// Whether calls are answered: paused by us, waiting for a plan or a number, or live.
function StatusBadge({ business, billing }: { business: Business; billing: Billing | null }) {
  if (!business.active) {
    return (
      <Badge variant="outline">
        <CirclePause /> Paused
      </Badge>
    );
  }
  if (billing?.needsPlan) {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
        <CircleAlert /> Choose a plan to go live
      </Badge>
    );
  }
  if (!business.twilio_number) {
    return (
      <Badge variant="outline">
        <CircleDashed /> Waiting for a phone number
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-600 text-white">
      <CircleCheck /> Answering calls
    </Badge>
  );
}

// The plan: when it renews or ends, a failed payment, or a way to choose one.
function PlanCard({ billing }: { billing: Billing }) {
  if (billing.needsPlan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {billing.status === 'canceled' ? 'Your plan has ended' : 'Choose a plan'}
          </CardTitle>
          <CardDescription>Your receptionist starts answering calls once you choose a plan.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/plan">
              See plans <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Plan</CardTitle>
        <CardAction>
          <ManageBillingButton />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {billing.status === 'past_due' && (
          <Alert variant="destructive">
            <AlertDescription>
              Your last payment didn't go through. Update your card under Manage billing to keep your receptionist
              answering calls.
            </AlertDescription>
          </Alert>
        )}
        <Fact icon={<CreditCard className="size-4" />} label={billing.plan ? planName(billing.plan) : 'Plan'}>
          {billing.periodEnd
            ? billing.cancels
              ? `Ends on ${formatDate(billing.periodEnd)}`
              : `Renews on ${formatDate(billing.periodEnd)}`
            : 'Active'}
        </Fact>
      </CardContent>
    </Card>
  );
}

function ReceptionistCard({ business, billing }: { business: Business; billing: Billing | null }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{business.name}</CardTitle>
          <StatusBadge business={business} billing={billing} />
        </div>
        <CardDescription>Your receptionist</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link to="/setup">
              <Settings /> Edit settings
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <Fact icon={<PhoneCall className="size-4" />} label="Number callers dial">
          {business.twilio_number ? formatNumber(business.twilio_number) : 'Not assigned yet'}
        </Fact>
        <Fact icon={<Languages className="size-4" />} label="Speaks">
          {business.languages.map((code) => LANGUAGE_NAMES[code] ?? code).join(' and ')}
        </Fact>
      </CardContent>
    </Card>
  );
}

// Coming back from Stripe Checkout (/?checkout=<session>): confirms the payment, then drops the
// session from the address so a reload doesn't confirm it again.
function useCheckoutReturn() {
  const { checkout } = useSearch({ from: '/owner/' });
  const navigate = useNavigate();
  const confirm = useConfirmCheckout();
  const started = useRef(false);
  useEffect(() => {
    if (!checkout || started.current) return;
    started.current = true;
    confirm.mutate(checkout, {
      onSuccess: (billing) =>
        billing.needsPlan
          ? toast.info('Your payment is still being processed. This page updates once it goes through.')
          : toast.success(`Payment received. You're on ${billing.plan ? planName(billing.plan) : 'your plan'}.`),
      onError: (err) => toast.error(`Could not confirm your payment: ${err.message}`),
      onSettled: () => navigate({ to: '/', search: {}, replace: true }),
    });
  }, [checkout, confirm, navigate]);
}

// What an owner sees after signing in: their receptionist and plan, or a way to set one up. Call
// history comes next.
export function DashboardPage() {
  const { data, isPending, error } = useMe();
  useCheckoutReturn();

  if (isPending) return <Skeleton className="h-48" />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load your account: {error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-2xl">Welcome, {data.user.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground">Signed in as {data.user.email}</p>
      </div>
      {data.business ? (
        <>
          <ReceptionistCard business={data.business} billing={data.billing} />
          {data.billing && (data.business.requires_subscription || data.billing.plan) && (
            <PlanCard billing={data.billing} />
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Sparkles className="size-5" />
            </div>
            <CardTitle className="text-lg">Let's set up your receptionist</CardTitle>
            <CardDescription>
              Tell it about your business, the languages it speaks and what it should do with calls. It takes about five
              minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/setup">
                Get started <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
