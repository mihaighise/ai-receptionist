import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { type TopUp, useTopUp } from '@/api/owner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';

// "$40" or "$12.50"
const dollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 ? 2 : 0,
  });

// Buy extra minutes: pick how many with the slider, then pay on Stripe's Checkout page.
export function TopUpCard({ topUp, testMode }: { topUp: TopUp; testMode: boolean }) {
  const [minutes, setMinutes] = useState(Math.min(topUp.max, Math.max(topUp.min, 200)));
  const buy = useTopUp();
  const busy = buy.isPending || buy.isSuccess;
  const price = dollars(minutes * topUp.centsPerMinute);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Buy extra minutes</CardTitle>
        <CardDescription>
          {dollars(topUp.centsPerMinute)} a minute. Extra minutes don't expire, and are used once a month's plan minutes
          run out.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {buy.error && (
          <Alert variant="destructive">
            <AlertDescription>{buy.error.message}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-baseline justify-between gap-4">
          <p>
            <output htmlFor="top-up-minutes" className="font-semibold text-3xl tabular-nums tracking-tight">
              {minutes.toLocaleString('en-US')}
            </output>
            <span className="text-muted-foreground"> minutes</span>
          </p>
          <p className="font-semibold text-xl tabular-nums">{price}</p>
        </div>
        <Slider
          id="top-up-minutes"
          aria-label="Extra minutes"
          min={topUp.min}
          max={topUp.max}
          step={topUp.step}
          value={[minutes]}
          onValueChange={([value]) => setMinutes(value)}
          disabled={busy}
          className="py-2"
        />
        <div className="-mt-3 flex justify-between text-muted-foreground text-xs tabular-nums">
          <span>{topUp.min.toLocaleString('en-US')}</span>
          <span>{topUp.max.toLocaleString('en-US')}</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            One-time payment on Stripe's secure page.
            {testMode && ' Test mode: card 4242 4242 4242 4242.'}
          </p>
          <Button onClick={() => buy.mutate(minutes)} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Buy {minutes.toLocaleString('en-US')} minutes for {price}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
