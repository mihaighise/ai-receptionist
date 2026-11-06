import { Navigate } from '@tanstack/react-router';
import { ArrowRight, Check, CircleCheck, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { type Plan, useCheckout, useMe, usePlans } from '@/api/owner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ManageBillingButton } from './manage-billing-button';
import { planName } from './plan-format';

// What every plan includes; they differ only in call minutes.
const INCLUDED = [
  'Answers every call, day and night',
  'Speaks your customers’ languages',
  'Sends you each message by text or WhatsApp',
  'Puts urgent callers through to you',
];
const POPULAR = 'pro';

// One plan, as a radio button: clicking anywhere on the card selects it.
function PlanOption({ plan, selected, onSelect }: { plan: Plan; selected: boolean; onSelect: () => void }) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm transition-colors',
        'hover:border-primary/50 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
        selected && 'border-primary ring-1 ring-primary hover:border-primary',
      )}
    >
      <input type="radio" name="plan" value={plan.code} checked={selected} onChange={onSelect} className="sr-only" />
      <div className="flex items-center gap-2">
        <span className="font-semibold text-lg">{plan.name}</span>
        {plan.code === POPULAR && <Badge variant={selected ? 'default' : 'secondary'}>Most popular</Badge>}
        <CircleCheck
          aria-hidden="true"
          className={cn('ml-auto size-5 text-primary transition-opacity', !selected && 'opacity-0')}
        />
      </div>
      <span className="text-muted-foreground text-sm">{plan.minutes.toLocaleString('en-US')} call minutes a month</span>
      <span>
        <span className="font-semibold text-3xl">${plan.priceCents / 100}</span>
        <span className="text-muted-foreground"> / month</span>
      </span>
    </label>
  );
}

// /plan: pick a plan and pay for it on Stripe's Checkout page.
export function PlanPage() {
  const me = useMe();
  const plans = usePlans();
  const checkout = useCheckout();
  const [selected, setSelected] = useState(POPULAR);

  if (me.isPending || plans.isPending) return <Skeleton className="h-96" />;
  if (me.error || plans.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load the plans: {(me.error ?? plans.error)?.message}</AlertDescription>
      </Alert>
    );
  }
  if (!me.data.business) return <Navigate to="/setup" />;

  const { billing } = me.data;
  if (billing && !billing.needsPlan) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-start gap-4">
        <h1 className="font-semibold text-2xl">Your plan</h1>
        <p className="text-muted-foreground">
          {billing.plan
            ? `You're on ${planName(billing.plan)}. Change your plan or card, or cancel, on the billing page.`
            : "Your receptionist doesn't need a plan."}
        </p>
        {billing.plan && <ManageBillingButton />}
      </div>
    );
  }

  // Stays on after success, while the browser goes to Stripe.
  const busy = checkout.isPending || checkout.isSuccess;
  const chosen = plans.data.plans.find((plan) => plan.code === selected);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-2xl">Choose a plan</h1>
        <p className="text-muted-foreground">
          {billing?.status === 'canceled'
            ? 'Your plan has ended. Choose one to have your receptionist answer calls again.'
            : 'Your receptionist starts answering calls once you choose a plan. Cancel any time.'}
        </p>
      </div>
      {checkout.error && (
        <Alert variant="destructive">
          <AlertDescription>{checkout.error.message}</AlertDescription>
        </Alert>
      )}
      <fieldset className="grid min-w-0 gap-4 md:grid-cols-3" disabled={busy}>
        <legend className="sr-only">Plan</legend>
        {plans.data.plans.map((plan) => (
          <PlanOption
            key={plan.code}
            plan={plan}
            selected={plan.code === selected}
            onSelect={() => setSelected(plan.code)}
          />
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => checkout.mutate(selected)} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Continue with {chosen?.name}
          {!busy && <ArrowRight />}
        </Button>
        {chosen && (
          <span className="text-muted-foreground text-sm">
            ${chosen.priceCents / 100} a month, paid on the next page
          </span>
        )}
      </div>
      <Card>
        <CardContent>
          <h2 className="mb-3 font-medium">Every plan includes</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-sm">
        You pay on Stripe’s secure page; your card details never reach us.
        {plans.data.testMode && ' Test mode: pay with card 4242 4242 4242 4242, any future date and any CVC.'}
      </p>
    </div>
  );
}
