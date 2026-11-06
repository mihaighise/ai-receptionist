import { zodResolver } from '@hookform/resolvers/zod';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil, Plus } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Controller, type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { Business, Options } from '@/api/businesses';
import { ApiError } from '@/api/client';
import { useGreetingPreview, useOwnerOptions, useSaveMyBusiness } from '@/api/owner';
import { CheckboxGroup } from '@/components/checkbox-group';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { skillUi } from '@/features/skills';
import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { MenuPhotos } from './menu-photos';
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

// The template of the business type picked in the first step, or the "other" one.
function useBusinessType(form: Form, options: Options) {
  const code = useWatch({ control: form.control, name: 'business_type' });
  return (
    options.businessTypes.find((type) => type.code === code) ??
    options.businessTypes.find((type) => type.code === 'other') ??
    options.businessTypes[0]
  );
}

// "What kind of business is it?": one card per type. In a new setup, picking one switches on its
// skills; editing keeps what the owner already chose.
function BusinessTypePicker({ form, options, isNew }: { form: Form; options: Options; isNew: boolean }) {
  const { control, setValue, formState } = form;
  return (
    <Controller
      control={control}
      name="business_type"
      render={({ field }) => (
        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="mb-2 font-medium text-sm">What kind of business is it?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.businessTypes.map((type) => (
              <label
                key={type.code}
                className={cn(
                  'flex cursor-pointer flex-col rounded-lg border p-3 transition-colors hover:border-primary/50 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
                  field.value === type.code && 'border-primary bg-accent/40 ring-1 ring-primary hover:border-primary',
                )}
              >
                <input
                  type="radio"
                  name="business_type"
                  value={type.code}
                  checked={field.value === type.code}
                  onChange={() => {
                    field.onChange(type.code);
                    if (isNew) setValue('features', type.skills, { shouldDirty: true });
                  }}
                  className="sr-only"
                />
                <span className="font-medium text-sm">{type.label}</span>
                <span className="text-muted-foreground text-xs">{type.examples}</span>
              </label>
            ))}
          </div>
          {formState.errors.business_type && (
            <p role="alert" className="mt-1.5 text-destructive text-xs">
              {formState.errors.business_type.message}
            </p>
          )}
        </fieldset>
      )}
    />
  );
}

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

function BusinessStep({ form, options, isNew }: { form: Form; options: Options; isNew: boolean }) {
  const {
    register,
    formState: { errors },
  } = form;
  const type = useBusinessType(form, options);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BusinessTypePicker form={form} options={options} isNew={isNew} />
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
          placeholder={type?.placeholders.description}
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
        <Input id="hours" placeholder={type?.placeholders.hours} {...register('hours')} />
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
  const { control } = form;
  const features = useWatch({ control, name: 'features' });
  const type = useBusinessType(form, options);
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
      {/* The settings of each skill that's switched on (src/features/skills). */}
      {options.features
        .filter((feature) => features.includes(feature.code))
        .map((feature) => {
          const { Settings } = skillUi(feature.code);
          return Settings && <Settings key={feature.code} form={form} placeholders={type?.placeholders ?? {}} />;
        })}
      <p className="text-muted-foreground text-xs">Use international format for numbers, e.g. +15125550100.</p>
    </div>
  );
}

// The business type's starter common questions not yet in the list; tapping one adds it, for the
// owner to fill in the ___ parts.
function FaqIdeas({ form, options }: { form: Form; options: Options }) {
  const type = useBusinessType(form, options);
  const faq = useWatch({ control: form.control, name: 'faq' });
  const ideas = (type?.faq ?? []).filter((line) => !faq.includes(line));
  if (!ideas.length) return null;
  const add = (line: string) => {
    const current = form.getValues('faq').trimEnd();
    form.setValue('faq', [current, line].filter(Boolean).join('\n'), { shouldDirty: true });
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        Ideas for {type.label.toLowerCase()}: tap one to add it, then fill in the ___ parts.
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Ideas">
        {ideas.map((line) => (
          <li key={line}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto py-1.5 text-left font-normal whitespace-normal"
              onClick={() => add(line)}
            >
              <Plus /> {line}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FaqStep({ form, options }: { form: Form; options: Options }) {
  const type = useBusinessType(form, options);
  // Lines read from menu photos go after what's already written, for the owner to check.
  const addLines = useCallback(
    (lines: string[]) => {
      const current = form.getValues('faq').trimEnd();
      form.setValue('faq', [current, ...lines].filter(Boolean).join('\n'), { shouldDirty: true });
    },
    [form],
  );
  return (
    <div className="flex flex-col gap-4">
      <FormField
        label="What do callers often ask?"
        htmlFor="faq"
        hint="One fact per line. Your receptionist only knows what you write here and in the earlier steps, so the more you add, the fewer calls end in a message."
      >
        <Textarea
          id="faq"
          rows={8}
          placeholder={
            type?.faq.length
              ? type.faq.slice(0, 4).join('\n')
              : 'We offer free parking behind the building.\nWe accept cards and cash.'
          }
          {...form.register('faq')}
        />
      </FormField>
      <FaqIdeas form={form} options={options} />
      <MenuPhotos onLines={addLines} />
    </div>
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
          <p>{options.businessTypes.find((type) => type.code === settings.business_type)?.label}</p>
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
          {settings.features.map((code) => (
            <p key={code}>{skillUi(code).summary(settings, featureLabel(code))}</p>
          ))}
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
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={business ? 'Your receptionist' : 'Set up your receptionist'}
        description={
          business
            ? 'Change what your receptionist knows and does. Changes apply from the next call.'
            : 'Tell your receptionist about your business. It takes about five minutes, and you can change everything later.'
        }
      />

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
                {current.id === 'business' && <BusinessStep form={form} options={options} isNew={!business} />}
                {current.id === 'languages' && <LanguagesStep form={form} options={options} />}
                {current.id === 'actions' && <ActionsStep form={form} options={options} />}
                {current.id === 'faq' && <FaqStep form={form} options={options} />}
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
