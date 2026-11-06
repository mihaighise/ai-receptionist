import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Building2,
  Clock3,
  CreditCard,
  Headset,
  Languages,
  MessageSquareText,
  PhoneForwarded,
  PhoneIncoming,
  Plus,
  ScanText,
  Scissors,
  Sparkles,
  Stethoscope,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { usePublicPlans } from '@/api/public';
import { Logo } from '@/components/logo';
import { Skeleton } from '@/components/ui/skeleton';
import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { VoiceOrb } from './voice-orb';

// Everything here describes what the product does today; no invented customers, reviews or numbers.

const glass = 'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl';
const gradientText = 'bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent';

function GetStarted({ className, children = 'Get started' }: { className?: string; children?: ReactNode }) {
  return (
    <Link
      to="/sign-in"
      className={cn(
        'group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-violet-500 px-6 py-3 font-semibold text-slate-950 shadow-[0_0_30px_rgba(56,189,248,0.35)] transition hover:shadow-[0_0_45px_rgba(139,92,246,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200',
        className,
      )}
    >
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-3 font-medium text-cyan-300 text-sm uppercase tracking-[0.2em]">{eyebrow}</p>
      <h2 className="font-display font-semibold text-3xl tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-slate-400">{children}</p>}
    </div>
  );
}

// The call in the hero: the same words as the sample the orb plays.
const CALL: { who: 'agent' | 'caller'; text: string }[] = [
  { who: 'agent', text: 'Thanks for calling Lone Star Plumbing and Drain. How can I help you today?' },
  { who: 'caller', text: 'How much is it for someone to come out?' },
  { who: 'agent', text: 'A standard service call is $89, and it’s waived if we do the repair.' },
  { who: 'caller', text: 'OK. Can someone call me back about a leak?' },
  { who: 'agent', text: 'I can take a message, and the team will call you back on 512-555-0142.' },
];

function CallPreview() {
  return (
    <div className={cn(glass, 'motion-safe-only animate-float p-4 sm:p-5')}>
      <div className="mb-4 flex items-center gap-2 text-slate-400 text-xs">
        <span className="relative flex size-2">
          <span className="motion-safe-only absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        Live call · Lone Star Plumbing & Drain
      </div>
      <ol className="flex flex-col gap-2.5">
        {CALL.map((line, i) => (
          <li
            key={line.text}
            className={cn(
              'motion-safe-only max-w-[88%] animate-rise rounded-2xl px-3.5 py-2 text-sm leading-snug',
              line.who === 'agent'
                ? 'self-start rounded-tl-sm bg-gradient-to-br from-sky-500/25 to-violet-500/25 text-slate-100 ring-1 ring-white/10'
                : 'self-end rounded-tr-sm bg-white/10 text-slate-200',
            )}
            style={{ animationDelay: `${0.4 + i * 0.7}s` }}
          >
            <span className="sr-only">{line.who === 'agent' ? 'Receptionist: ' : 'Caller: '}</span>
            {line.text}
          </li>
        ))}
      </ol>
      <div
        className="motion-safe-only mt-4 flex animate-rise items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-emerald-200 text-xs"
        style={{ animationDelay: `${0.4 + CALL.length * 0.7}s` }}
      >
        <MessageSquareText className="size-4 shrink-0" />
        Message texted to the owner as soon as the call ended.
      </div>
    </div>
  );
}

const FEATURES: { icon: typeof Clock3; title: string; text: string }[] = [
  {
    icon: Clock3,
    title: 'Answers every call, day and night',
    text: 'Weekends, holidays, the lunch rush and three calls at once: every caller gets a friendly answer right away.',
  },
  {
    icon: Languages,
    title: 'English and Spanish',
    text: 'It greets callers in your main language and switches as soon as they speak the other one.',
  },
  {
    icon: MessageSquareText,
    title: 'Messages, straight to your phone',
    text: 'Name, callback number and what they need, texted to you by SMS or WhatsApp the moment the call ends. Urgent ones are flagged.',
  },
  {
    icon: PhoneForwarded,
    title: 'Puts urgent callers through',
    text: 'When a caller asks for a person, or something can’t wait, it transfers them to you or your team.',
  },
  {
    icon: ScanText,
    title: 'Knows your menu and prices',
    text: 'Photograph your menu or price list and it’s typed in for you, so it can answer “how much is…?” on its own.',
  },
  {
    icon: PhoneIncoming,
    title: 'Every call, in one place',
    text: 'See who called, when, for how long, and every message, from your phone or computer.',
  },
];

const INDUSTRIES: { icon: typeof Wrench; title: string; text: string }[] = [
  {
    icon: Wrench,
    title: 'Home services',
    text: 'Plumbers, electricians, HVAC and cleaners: emergencies flagged urgent and put through, everything else waiting as a message.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Restaurants and cafés',
    text: 'Hours, menu, prices, takeout and parking questions answered, in English and Spanish, even in the middle of service.',
  },
  {
    icon: Scissors,
    title: 'Salons, spas and barbers',
    text: 'Prices and opening times answered, and booking requests taken as messages while your hands are busy.',
  },
  {
    icon: Stethoscope,
    title: 'Dental and medical offices',
    text: 'New-patient and insurance questions answered, and patients in pain flagged urgent for the team.',
  },
];

const STEPS = [
  {
    icon: Building2,
    title: 'Tell it about your business',
    text: 'Pick your kind of business and answer a few questions, or snap your menu. About five minutes.',
  },
  { icon: CreditCard, title: 'Choose a plan', text: 'Pay securely with Stripe. Change or cancel any time.' },
  {
    icon: Headset,
    title: 'It answers your calls',
    text: 'Your receptionist gets its own local number. Forward your line to it, and watch the calls come in.',
  },
];

const FAQ = [
  {
    q: 'What happens when it doesn’t know the answer?',
    a: 'It never guesses. It says so, takes a message with the caller’s name and number, and texts it to you right after the call. If you turned on transfers, it can put the caller through to you instead.',
  },
  {
    q: 'Which languages does it speak?',
    a: 'English and Spanish. It greets callers in your main language, tells them they can speak the other one, and switches as soon as they do.',
  },
  {
    q: 'Can I keep my phone number?',
    a: 'Yes. Your receptionist gets its own local number, and you forward your existing line to it, for every call or only the ones you can’t pick up. Your customers keep calling the number they know.',
  },
  {
    q: 'What if I run out of minutes?',
    a: 'A call in progress is never cut off. You can buy extra minutes at any time; they never expire. If you do run out, new callers are put through to you if transfers are on, or asked to call back later.',
  },
  {
    q: 'How long does it take to set up?',
    a: 'About five minutes: pick your kind of business, describe it, choose what it should do, and add the questions callers ask. You can change everything later, and changes apply from the next call.',
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes, from the billing page, in a couple of clicks. Your plan runs until the end of the month you paid for.',
  },
];

function Pricing() {
  const { data } = usePublicPlans();
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {!data
        ? [1, 2, 3].map((n) => <Skeleton key={n} className="h-72 rounded-2xl bg-white/5" />)
        : data.plans.map((plan) => {
            const popular = plan.code === 'pro';
            return (
              <div
                key={plan.code}
                className={cn(
                  glass,
                  'relative flex flex-col gap-5 p-6',
                  popular && 'border-cyan-300/40 shadow-[0_0_60px_-15px_rgba(56,189,248,0.6)]',
                )}
              >
                {popular && (
                  <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-3 py-1 font-semibold text-slate-950 text-xs">
                    Most popular
                  </span>
                )}
                <div>
                  <h3 className="font-display font-semibold text-xl">{plan.name}</h3>
                  <p className="text-slate-400 text-sm">{plan.minutes.toLocaleString('en-US')} call minutes a month</p>
                </div>
                <p>
                  <span className="font-display font-semibold text-5xl tracking-tight">${plan.priceCents / 100}</span>
                  <span className="text-slate-400"> / month</span>
                </p>
                <ul className="flex flex-1 flex-col gap-2 text-slate-300 text-sm">
                  {[
                    'Answers every call, 24/7',
                    'English and Spanish',
                    'Messages by text or WhatsApp',
                    'Transfers to a person',
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-cyan-300" />
                      {item}
                    </li>
                  ))}
                </ul>
                <GetStarted
                  className={cn(
                    'w-full',
                    !popular &&
                      'bg-none bg-white/10 text-white shadow-none ring-1 ring-white/15 hover:bg-white/15 hover:shadow-none',
                  )}
                >
                  Choose {plan.name}
                </GetStarted>
              </div>
            );
          })}
      {data && (
        <p className="text-center text-slate-400 text-sm md:col-span-3">
          Need more? Extra minutes are ${(data.topUp.centsPerMinute / 100).toFixed(2)} each and never expire.
        </p>
      )}
    </div>
  );
}

// /welcome: the public landing page. Always dark, whatever the visitor's theme.
export function LandingPage() {
  return (
    <div className="dark relative min-h-dvh overflow-x-clip bg-[#05060d] font-sans text-slate-100">
      {/* Background: drifting aurora, a faint grid, and a glow at the top. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="motion-safe-only absolute -top-1/3 left-1/2 h-[900px] w-[1400px] -translate-x-1/2 animate-aurora rounded-full bg-[conic-gradient(from_120deg,rgba(56,189,248,0.22),rgba(139,92,246,0.25),rgba(34,211,238,0.12),rgba(99,102,241,0.22),rgba(56,189,248,0.22))] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      </div>

      <header className="sticky top-0 z-30 border-white/5 border-b bg-[#05060d]/70 backdrop-blur-xl">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3.5 sm:px-6">
          <Link to="/welcome">
            <Logo />
          </Link>
          <div className="hidden flex-1 justify-center gap-7 text-slate-300 text-sm md:flex">
            {[
              ['How it works', '#how'],
              ['Features', '#features'],
              ['Pricing', '#pricing'],
              ['Questions', '#faq'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="transition hover:text-white">
                {label}
              </a>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link to="/sign-in" className="rounded-full px-3 py-2 text-slate-300 text-sm transition hover:text-white">
              Sign in
            </Link>
            <GetStarted className="hidden px-4 py-2 text-sm sm:inline-flex" />
          </div>
        </nav>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-28">
          <div className="motion-safe-only animate-rise text-center lg:text-left">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300 text-xs backdrop-blur">
              <Sparkles className="size-3.5 text-cyan-300" />
              AI receptionist · English and Spanish
            </p>
            <h1 className="font-display font-semibold text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Never miss <span className={gradientText}>another call.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-slate-300 lg:mx-0">
              {APP_NAME} answers your phone day and night, knows your business, takes messages and puts urgent callers
              through. In English and Spanish, with a voice your customers will like.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <GetStarted />
              <a
                href="#pricing"
                className="rounded-full px-5 py-3 font-medium text-slate-200 ring-1 ring-white/15 transition hover:bg-white/5"
              >
                See pricing
              </a>
            </div>
            <p className="mt-5 text-slate-500 text-sm">
              Set up in about five minutes · Plans from $79 a month · Cancel any time
            </p>
          </div>
          <VoiceOrb />
        </section>

        {/* The call: what the sample says, and what happens with it */}
        <section
          aria-label="A real call"
          className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-2 lg:gap-16"
        >
          <div className="text-center lg:text-left">
            <p className="mb-3 font-medium text-cyan-300 text-sm uppercase tracking-[0.2em]">A real call</p>
            <h2 className="font-display font-semibold text-3xl tracking-tight sm:text-4xl">
              It knows your business, <span className={gradientText}>and never guesses.</span>
            </h2>
            <p className="mt-4 text-slate-400">
              Your receptionist answers from what you tell it: your hours, prices, menu and the questions customers ask.
              When it can’t help, it doesn’t make things up. It takes a message and gets it to you right away.
            </p>
            <ul className="mx-auto mt-6 flex max-w-md flex-col gap-3 text-left text-slate-300 text-sm lg:mx-0">
              {[
                'Answers questions in a natural voice, one or two sentences at a time',
                'Reads back the caller’s details before saving a message',
                'Texts you the message, marked urgent when it is',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-cyan-300" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-md">
            <CallPreview />
          </div>
        </section>

        {/* Highlights */}
        <section aria-label="At a glance" className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className={cn(glass, 'grid grid-cols-2 divide-white/10 md:grid-cols-4 md:divide-x')}>
            {[
              ['24/7', 'every call answered'],
              ['2', 'languages, switching mid-call'],
              ['~5 min', 'to set up'],
              ['$0', 'to cancel, any time'],
            ].map(([big, small]) => (
              <div key={small} className="p-5 text-center sm:p-6">
                <p className={cn('font-display font-semibold text-3xl sm:text-4xl', gradientText)}>{big}</p>
                <p className="mt-1 text-slate-400 text-sm">{small}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <SectionTitle eyebrow="How it works" title="Live in three steps" />
          <ol className="grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className={cn(glass, 'relative p-6')}>
                <span className="absolute top-5 right-6 font-display font-semibold text-5xl text-white/5">
                  0{i + 1}
                </span>
                <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-200 ring-1 ring-white/10">
                  <step.icon className="size-5" />
                </span>
                <h3 className="font-display font-semibold text-lg">{step.title}</h3>
                <p className="mt-2 text-slate-400 text-sm">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <SectionTitle
            eyebrow="Features"
            title={
              <>
                A receptionist that <span className={gradientText}>never takes a break</span>
              </>
            }
          >
            Everything a great front desk does on the phone, without the hold music.
          </SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className={cn(glass, 'group p-6 transition hover:border-cyan-300/30 hover:bg-white/[0.05]')}
              >
                <feature.icon className="mb-4 size-6 text-cyan-300 transition group-hover:text-violet-300" />
                <h3 className="font-display font-semibold">{feature.title}</h3>
                <p className="mt-2 text-slate-400 text-sm leading-relaxed">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Industries */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <SectionTitle eyebrow="Made for your business" title="Set up for the way you work">
            Pick your kind of business and start from questions and examples that already fit.
          </SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            {INDUSTRIES.map((industry) => (
              <div key={industry.title} className={cn(glass, 'flex gap-4 p-6')}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-violet-200 ring-1 ring-white/10">
                  <industry.icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-display font-semibold">{industry.title}</h3>
                  <p className="mt-1.5 text-slate-400 text-sm leading-relaxed">{industry.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <SectionTitle eyebrow="Pricing" title="Simple monthly plans">
            Every plan includes everything. Pick the one with enough minutes for your calls.
          </SectionTitle>
          <Pricing />
        </section>

        {/* Questions */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <SectionTitle eyebrow="Questions" title="Good to know" />
          <div className="flex flex-col gap-3">
            {FAQ.map((item) => (
              <details key={item.q} className={cn(glass, 'group px-5 py-4 open:bg-white/[0.05]')}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus aria-hidden="true" className="size-5 shrink-0 text-cyan-300 transition group-open:rotate-45" />
                </summary>
                <p className="mt-3 text-slate-400 text-sm leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final call to action */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/15 via-indigo-500/10 to-violet-600/20 px-6 py-14 text-center sm:px-12">
            <div
              aria-hidden="true"
              className="absolute -top-24 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl"
            />
            <h2 className="relative font-display font-semibold text-3xl tracking-tight sm:text-5xl">
              Your next customer is <span className={gradientText}>calling right now.</span>
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-slate-300">
              Set up {APP_NAME} in about five minutes and let it pick up from the very next call.
            </p>
            <GetStarted className="relative mt-8" />
          </div>
        </section>
      </main>

      <footer className="relative border-white/5 border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-slate-500 text-sm sm:flex-row sm:px-6">
          <Logo />
          <p>
            © {new Date().getFullYear()} {APP_NAME}. Made for businesses that can’t afford to miss a call.
          </p>
          <Link to="/sign-in" className="transition hover:text-slate-300">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
