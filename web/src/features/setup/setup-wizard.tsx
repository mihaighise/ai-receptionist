import { zodResolver } from '@hookform/resolvers/zod';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Controller, type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { Business, Options } from '@/api/businesses';
import { ApiError } from '@/api/client';
import { useGreetingPreview, useOwnerOptions, useSaveMyBusiness } from '@/api/owner';
import { CheckboxGroup } from '@/components/checkbox-group';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';
import {
  emptySetup,
  type SetupValues,
  STEPS,
  setupFieldForApiField,
  setupSchema,
  stepOfField,
  toSettings,
  toSetupValues,
} from './setup-schema';

type Form = UseFormReturn<SetupValues>;

// The step list at the top. Steps already reached can be clicked to go back to them.
function Stepper({ step, reached, onSelect }: { step: number; reached: number; onSelect: (index: number) => void }) {
  return (
    <nav aria-label="Setup steps">
      <p className="mb-3 text-muted-foreground text-sm sm:hidden">
        Step {step + 1} of {STEPS.length}: {STEPS[step].title}
      </p>
      <ol className="flex gap-2">
        {STEPS.map((s, index) => (
          <li key={s.id} className="flex-1">
            <button
              type="button"
              disabled={index > reached}
              onClick={() => onSelect(index)}
              aria-current={index === step ? 'step' : undefined}
              className="group flex w-full flex-col gap-2 text-left disabled:cursor-default"
            >
              <span
                className={cn(
                  'h-1.5 rounded-full bg-muted transition-colors',
                  index <= reached && 'bg-primary/40',
                  index === step && 'bg-primary',
                )}
              />
              <span
                className={cn(
                  'hidden text-muted-foreground text-xs sm:block',
                  index === step && 'font-medium text-foreground',
                  index <= reached && index !== step && 'group-hover:text-foreground',
                )}
              >
                {s.title}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function BusinessStep({ form }: { form: Form }) {
  const {
    register,
    formState: { errors },
  } = form;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Business name" htmlFor="name" className="sm:col-span-2" error={errors.name?.message}>
        <Input id="name" autoComplete="organization" aria-invalid={!!errors.name} {...register('name')} />
      </FormField>
      <FormField
        label="What does your business do?"
        htmlFor="description"
        className="sm:col-span-2"
        hint="A few words, as you'd describe it to a new customer."
        error={errors.description?.message}
      >
        <Textarea
          id="description"
          rows={2}
          placeholder="a family-owned plumbing company in Austin, fixing leaks, drains and water heaters"
          aria-invalid={!!errors.description}
          {...register('description')}
        />
      </FormField>
      <FormField label="Address" htmlFor="address">
        <Input id="address" autoComplete="street-address" {...register('address')} />
      </FormField>
      <FormField label="Your business phone" htmlFor="phone" hint="The number on your website, if callers ask for it.">
        <Input id="phone" inputMode="tel" autoComplete="tel" placeholder="+1 512 555 0100" {...register('phone')} />
      </FormField>
      <FormField label="Opening hours" htmlFor="hours" className="sm:col-span-2">
        <Input id="hours" placeholder="Weekdays 8am to 6pm" {...register('hours')} />
      </FormField>
    </div>
  );
}

function LanguagesStep({ form, options }: { form: Form; options: Options }) {
  const {
    control,
    setValue,
    getValues,
    formState: { errors },
  } = form;
  const mainLanguage = useWatch({ control, name: 'mainLanguage' });
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <FormField
        label="Main language"
        hint="Your receptionist greets every caller in this language."
        error={errors.mainLanguage?.message}
      >
        <Controller
          control={control}
          name="mainLanguage"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
                // The main language can't also be one of the others.
                setValue(
                  'otherLanguages',
                  getValues('otherLanguages').filter((code) => code !== value),
                  { shouldDirty: true },
                );
              }}
            >
              <SelectTrigger className="w-full" aria-label="Main language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.languages.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <FormField label="Also speaks" hint="Callers hear that they can switch, and it answers in their language.">
        <Controller
          control={control}
          name="otherLanguages"
          render={({ field }) => (
            <CheckboxGroup
              items={options.languages
                .filter((l) => l.code !== mainLanguage)
                .map((l) => ({ value: l.code, label: l.name }))}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </FormField>
    </div>
  );
}

function ActionsStep({ form, options }: { form: Form; options: Options }) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const features = useWatch({ control, name: 'features' });
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Your receptionist always answers questions about your business. It can also:
      </p>
      <Controller
        control={control}
        name="features"
        render={({ field }) => (
          <CheckboxGroup
            items={options.features.map((f) => ({ value: f.code, label: f.label }))}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {features.includes('messages') && (
        <fieldset className="grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <legend className="px-1 font-medium text-sm">Messages</legend>
          <p className="text-muted-foreground text-sm sm:col-span-2">
            When a caller wants to book, needs a callback or asks for something it can't answer, the receptionist takes
            a message and sends it to you as soon as the call ends.
          </p>
          <FormField label="Text messages to" htmlFor="notify_sms" error={errors.notify_sms?.message}>
            <Input
              id="notify_sms"
              inputMode="tel"
              placeholder="+15125550100"
              aria-invalid={!!errors.notify_sms}
              {...register('notify_sms')}
            />
          </FormField>
          <FormField label="WhatsApp messages to" htmlFor="notify_whatsapp" error={errors.notify_whatsapp?.message}>
            <Input
              id="notify_whatsapp"
              inputMode="tel"
              placeholder="+15125550100"
              aria-invalid={!!errors.notify_whatsapp}
              {...register('notify_whatsapp')}
            />
          </FormField>
          <FormField
            label="Mark a message urgent if…"
            htmlFor="urgent_when"
            className="sm:col-span-2"
            hint="Optional. Urgent messages are flagged so you see them first."
          >
            <Input id="urgent_when" placeholder="there is a burst pipe or flooding" {...register('urgent_when')} />
          </FormField>
        </fieldset>
      )}
      {features.includes('transfers') && (
        <fieldset className="grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <legend className="px-1 font-medium text-sm">Transfers</legend>
          <p className="text-muted-foreground text-sm sm:col-span-2">
            When a caller asks for a person, or something urgent can't wait, the receptionist puts them through.
          </p>
          <FormField label="Transfer callers to" htmlFor="transfer_number" error={errors.transfer_number?.message}>
            <Input
              id="transfer_number"
              inputMode="tel"
              placeholder="+15125550100"
              aria-invalid={!!errors.transfer_number}
              {...register('transfer_number')}
            />
          </FormField>
        </fieldset>
      )}
      <p className="text-muted-foreground text-xs">Use international format for numbers, e.g. +15125550100.</p>
    </div>
  );
}

function FaqStep({ form }: { form: Form }) {
  return (
    <FormField
      label="What do callers often ask?"
      htmlFor="faq"
      hint="One fact per line. Your receptionist only knows what you write here and in the earlier steps, so the more you add, the fewer calls end in a message."
    >
      <Textarea
        id="faq"
        rows={8}
        placeholder={
          'We serve all of Austin and Round Rock.\nA standard call-out costs $89, waived if we do the repair.\nWe offer 24/7 emergency service for burst pipes and flooding.\nWe accept cards and cash, not checks.'
        }
        {...form.register('faq')}
      />
    </FormField>
  );
}

function Summary({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 font-medium text-sm">{title}</h3>
        <div className="break-words text-muted-foreground text-sm">{children}</div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
        <Pencil /> Edit
      </Button>
    </div>
  );
}

function ReviewStep({
  form,
  options,
  onEdit,
}: {
  form: Form;
  options: Options;
  onEdit: (step: (typeof STEPS)[number]['id']) => void;
}) {
  const values = useWatch({ control: form.control }) as SetupValues;
  const settings = toSettings(values);
  const greeting = useGreetingPreview(settings, true);
  const languageName = (code: string) => options.languages.find((l) => l.code === code)?.name ?? code;
  const featureLabel = (code: string) => options.features.find((f) => f.code === code)?.label ?? code;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-muted/40 p-4">
        <h3 className="mb-2 font-medium text-sm">Callers will hear</h3>
        {greeting.isPending ? (
          <Skeleton className="h-5 w-3/4" />
        ) : greeting.error ? (
          <p className="text-destructive text-sm">Could not load the greeting: {greeting.error.message}</p>
        ) : (
          greeting.data.greeting.map((part) => (
            <p key={part.language}>
              “{part.text}” <span className="text-muted-foreground text-xs">({part.languageName})</span>
            </p>
          ))
        )}
      </section>

      <div>
        <Summary title="Your business" onEdit={() => onEdit('business')}>
          <p className="text-foreground">
            {settings.name}, {settings.description}
          </p>
          {settings.address && <p>{settings.address}</p>}
          {settings.phone && <p>{settings.phone}</p>}
          {settings.hours && <p>{settings.hours}</p>}
        </Summary>
        <Summary title="Languages" onEdit={() => onEdit('languages')}>
          {settings.languages.map(languageName).join(', ')}
        </Summary>
        <Summary title="What it does" onEdit={() => onEdit('actions')}>
          <p>Answers questions about your business</p>
          {settings.features.includes('messages') && (
            <p>
              {featureLabel('messages')}, sent to{' '}
              {[
                settings.notify_sms && `${settings.notify_sms} by text`,
                settings.notify_whatsapp && `${settings.notify_whatsapp} on WhatsApp`,
              ]
                .filter(Boolean)
                .join(' and ')}
            </p>
          )}
          {settings.features.includes('transfers') && (
            <p>
              {featureLabel('transfers')} at {settings.transfer_number}
            </p>
          )}
        </Summary>
        <Summary title="Common questions" onEdit={() => onEdit('faq')}>
          {settings.faq.length ? (
            <ul className="list-disc pl-5">
              {settings.faq.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            'None yet. Callers with questions will be offered a message instead.'
          )}
        </Summary>
      </div>
    </div>
  );
}

// Sets up the owner's receptionist step by step, or edits it (business = their business). Nothing
// is saved until the last step, which saves everything at once.
export function SetupWizard({ business }: { business: Business | null }) {
  const navigate = useNavigate();
  const { data: options } = useOwnerOptions();
  const save = useSaveMyBusiness();
  const [step, setStep] = useState(0);
  // The furthest step opened so far. Editing an existing business can jump to any step.
  const [reached, setReached] = useState(business ? STEPS.length - 1 : 0);
  const [formError, setFormError] = useState<string | null>(null);
  // Set just before leaving after saving, so the unsaved-changes check lets it through.
  const leaving = useRef(false);

  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: business ? toSetupValues(business) : emptySetup,
  });

  useBlocker({
    shouldBlockFn: () => !leaving.current && form.formState.isDirty && !window.confirm('Discard your changes?'),
    enableBeforeUnload: form.formState.isDirty,
  });

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Once a step shows errors, they're checked again as the owner types, so each one goes away as
  // soon as it's fixed instead of on the next click.
  useEffect(() => {
    const { unsubscribe } = form.watch(() => {
      const failing = current.fields.filter((field) => form.getFieldState(field).error);
      if (failing.length) form.trigger(failing);
    });
    return unsubscribe;
  }, [form, current]);

  const goTo = (index: number) => {
    setFormError(null);
    setStep(index);
    setReached((r) => Math.max(r, index));
    window.scrollTo({ top: 0 });
  };

  const next = async () => {
    if (await form.trigger([...current.fields], { shouldFocus: true })) goTo(step + 1);
  };

  // Goes to the first step with a problem, so its message is in view.
  const showFieldErrors = (fields: string[]) => {
    const steps = fields.map(stepOfField).filter((index) => index >= 0);
    if (steps.length) goTo(Math.min(...steps));
    setFormError('Please fix the highlighted fields.');
  };

  const onSave = form.handleSubmit(
    async (values) => {
      setFormError(null);
      try {
        await save.mutateAsync(toSettings(values));
        leaving.current = true;
        if (business) {
          toast.success('Your changes are saved.');
          navigate({ to: '/' });
        } else {
          // A new receptionist answers calls once it has a plan.
          toast.success('Your receptionist is set up. Choose a plan to go live.');
          navigate({ to: '/plan' });
        }
      } catch (err) {
        if (!(err instanceof ApiError)) return setFormError(`Could not reach ${APP_NAME}. Please try again.`);
        for (const [field, message] of Object.entries(err.fields)) {
          const formField = setupFieldForApiField(field);
          if (formField) form.setError(formField, { message });
        }
        if (Object.keys(err.fields).length) showFieldErrors(Object.keys(err.fields));
        else setFormError(err.message);
      }
    },
    (errors) => showFieldErrors(Object.keys(errors)),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-semibold text-2xl">{business ? 'Your receptionist' : 'Set up your receptionist'}</h1>
        <p className="text-muted-foreground">
          {business
            ? 'Change what your receptionist knows and does. Changes apply from the next call.'
            : 'Tell your receptionist about your business. It takes about five minutes, and you can change everything later.'}
        </p>
      </div>

      <Stepper step={step} reached={reached} onSelect={goTo} />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (isLast) onSave();
          else next();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{current.title}</CardTitle>
            {current.id === 'review' && (
              <CardDescription>
                Check everything, then {business ? 'save your changes' : 'finish setup'}.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            {!options ? (
              <Skeleton className="h-40" />
            ) : (
              <>
                {current.id === 'business' && <BusinessStep form={form} />}
                {current.id === 'languages' && <LanguagesStep form={form} options={options} />}
                {current.id === 'actions' && <ActionsStep form={form} options={options} />}
                {current.id === 'faq' && <FaqStep form={form} />}
                {current.id === 'review' && (
                  <ReviewStep
                    form={form}
                    options={options}
                    onEdit={(id) => goTo(STEPS.findIndex((s) => s.id === id))}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 flex items-center gap-2">
          {step > 0 && (
            <Button type="button" variant="ghost" onClick={() => goTo(step - 1)}>
              <ArrowLeft /> Back
            </Button>
          )}
          <span className="flex-1" />
          {isLast ? (
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              {business ? 'Save changes' : 'Finish setup'}
            </Button>
          ) : (
            <Button type="submit">
              Next <ArrowRight />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
