import { zodResolver } from '@hookform/resolvers/zod';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { Eye, Loader2, Save } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { type Business, useOptions, usePreview, useSaveBusiness } from '@/api/businesses';
import { ApiError } from '@/api/client';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  type BusinessFormValues,
  businessFormSchema,
  emptyBusiness,
  formFieldForApiField,
  slugify,
  toFormValues,
  toInput,
} from './business-schema';
import { DeleteBusinessButton } from './delete-business-button';
import { PreviewPanel } from './preview-panel';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

// A checkbox list over an array field: ticking adds the value, unticking removes it.
function CheckboxGroup({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
      {items.map((item) => (
        <Label key={item.value} className="cursor-pointer font-normal">
          <Checkbox
            checked={value.includes(item.value)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, item.value] : value.filter((v) => v !== item.value))
            }
          />
          {item.label}
        </Label>
      ))}
    </div>
  );
}

// Create (business = null) or edit a business. The page gives each business its own form
// (key={id}), so switching businesses always starts from that business's saved values.
export function BusinessForm({ business }: { business: Business | null }) {
  const navigate = useNavigate();
  const { data: options } = useOptions();
  const save = useSaveBusiness(business?.id ?? null);
  const preview = usePreview();
  const [formError, setFormError] = useState<string | null>(null);
  // A new business gets its slug from its name until the slug is edited by hand.
  const slugEdited = useRef(Boolean(business));
  // Set just before leaving on purpose (after saving or deleting), so the unsaved-changes check lets it through.
  const leaving = useRef(false);

  const form = useForm<BusinessFormValues>({
    resolver: zodResolver(businessFormSchema),
    defaultValues: business ? toFormValues(business) : emptyBusiness,
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = form;
  const mainLanguage = useWatch({ control, name: 'mainLanguage' });

  // Ask before leaving the page or closing the tab with unsaved changes.
  useBlocker({
    shouldBlockFn: () => !leaving.current && form.formState.isDirty && !window.confirm('Discard unsaved changes?'),
    enableBeforeUnload: isDirty,
  });

  // Puts the API's field messages next to the matching inputs.
  const showError = (err: unknown) => {
    if (!(err instanceof ApiError)) {
      setFormError('Could not reach the API. Is it running (npm run api)?');
      return;
    }
    for (const [field, message] of Object.entries(err.fields)) {
      const formField = formFieldForApiField(field);
      if (formField) setError(formField, { message });
    }
    setFormError(err.message);
  };
  const invalid = () => setFormError('Please fix the highlighted fields.');

  const onSave = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(toInput(values));
      toast.success(`Saved ${saved.name}`);
      form.reset(toFormValues(saved));
      if (!business) {
        leaving.current = true;
        navigate({ to: '/admin/businesses/$businessId', params: { businessId: saved.id } });
      }
    } catch (err) {
      showError(err);
    }
  }, invalid);

  const onPreview = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await preview.mutateAsync(toInput(values));
    } catch (err) {
      showError(err);
    }
  }, invalid);

  const nameField = register('name', {
    onChange: (e) => {
      if (!slugEdited.current) setValue('slug', slugify(e.target.value));
    },
  });
  const slugField = register('slug', {
    onChange: () => {
      slugEdited.current = true;
    },
  });

  const languages = options?.languages ?? [];
  const features = options?.features ?? [];

  return (
    <form onSubmit={onSave} noValidate className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-xl">{business ? business.name : 'New business'}</h1>
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <Label className="cursor-pointer font-normal">
              <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              Active (answers calls)
            </Label>
          )}
        />
      </div>

      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Section title="Business" description="The receptionist only knows what's written here.">
        <FormField label="Name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="off" autoFocus={!business} aria-invalid={!!errors.name} {...nameField} />
        </FormField>
        <FormField
          label="Slug"
          htmlFor="slug"
          hint="Short, stable ID, e.g. rapid-flow-plumbing"
          error={errors.slug?.message}
        >
          <Input id="slug" autoComplete="off" aria-invalid={!!errors.slug} {...slugField} />
        </FormField>
        <FormField
          label="Description"
          htmlFor="description"
          className="sm:col-span-2"
          hint={
            <>
              Finishes the sentence "You are the phone receptionist for <em>Name</em>, …"
            </>
          }
          error={errors.description?.message}
        >
          <Textarea
            id="description"
            rows={2}
            placeholder="a family-owned plumbing company fixing leaks, clogged drains…"
            aria-invalid={!!errors.description}
            {...register('description')}
          />
        </FormField>
        <FormField label="Address" htmlFor="address">
          <Input id="address" {...register('address')} />
        </FormField>
        <FormField label="Public phone" htmlFor="phone">
          <Input id="phone" placeholder="+1 555 010 0000" {...register('phone')} />
        </FormField>
        <FormField label="Hours" htmlFor="hours" className="sm:col-span-2">
          <Input id="hours" placeholder="Monday to Friday 8am to 6pm, closed Sunday" {...register('hours')} />
        </FormField>
        <FormField label="FAQ" htmlFor="faq" className="sm:col-span-2" hint="One fact per line, as a plain sentence.">
          <Textarea id="faq" rows={5} {...register('faq')} />
        </FormField>
      </Section>

      <Section title="Owner" description="The person who manages this business in the owner app.">
        <FormField
          label="Owner's email"
          htmlFor="owner_email"
          hint="The email of their Google account. They need to have signed in once."
          error={errors.owner_email?.message}
        >
          <Input
            id="owner_email"
            type="email"
            autoComplete="off"
            placeholder="owner@example.com"
            aria-invalid={!!errors.owner_email}
            {...register('owner_email')}
          />
        </FormField>
      </Section>

      <Section title="Phone line">
        <FormField
          label="Twilio number"
          htmlFor="twilio_number"
          hint="The number callers dial. Empty means no calls reach this business."
          error={errors.twilio_number?.message}
        >
          <Input
            id="twilio_number"
            inputMode="tel"
            placeholder="+18005550100"
            aria-invalid={!!errors.twilio_number}
            {...register('twilio_number')}
          />
        </FormField>
      </Section>

      <Section title="Languages">
        <FormField
          label="Main language"
          hint="The greeting is spoken in this language."
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
                    form.getValues('otherLanguages').filter((code) => code !== value),
                    { shouldDirty: true },
                  );
                }}
              >
                <SelectTrigger className="w-full" aria-label="Main language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField label="Also speaks">
          <Controller
            control={control}
            name="otherLanguages"
            render={({ field }) => (
              <CheckboxGroup
                items={languages.filter((l) => l.code !== mainLanguage).map((l) => ({ value: l.code, label: l.name }))}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </FormField>
      </Section>

      <Section title="What the receptionist does">
        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="features"
            render={({ field }) => (
              <CheckboxGroup
                items={features.map((f) => ({ value: f.code, label: f.label }))}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        <FormField
          label="Transfer to"
          htmlFor="transfer_number"
          hint="Used when transfers are on."
          error={errors.transfer_number?.message}
        >
          <Input
            id="transfer_number"
            inputMode="tel"
            placeholder="+18005550100"
            aria-invalid={!!errors.transfer_number}
            {...register('transfer_number')}
          />
        </FormField>
        <FormField label="Mark urgent when" htmlFor="urgent_when" hint='Finishes "Mark it urgent if …"'>
          <Input id="urgent_when" placeholder="there is a burst pipe or flooding" {...register('urgent_when')} />
        </FormField>
        <FormField label="Send messages by SMS to" htmlFor="notify_sms" error={errors.notify_sms?.message}>
          <Input
            id="notify_sms"
            inputMode="tel"
            placeholder="+18005550100"
            aria-invalid={!!errors.notify_sms}
            {...register('notify_sms')}
          />
        </FormField>
        <FormField
          label="Send messages by WhatsApp to"
          htmlFor="notify_whatsapp"
          error={errors.notify_whatsapp?.message}
        >
          <Input
            id="notify_whatsapp"
            inputMode="tel"
            placeholder="+18005550100"
            aria-invalid={!!errors.notify_whatsapp}
            {...register('notify_whatsapp')}
          />
        </FormField>
      </Section>

      {preview.data && <PreviewPanel preview={preview.data} onClose={() => preview.reset()} />}

      {/* Stays at the bottom of the window while scrolling, so Save is always in reach. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t bg-background/90 px-1 py-3 backdrop-blur">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
        <Button type="button" variant="outline" onClick={onPreview} disabled={preview.isPending}>
          {preview.isPending ? <Loader2 className="animate-spin" /> : <Eye />} Preview
        </Button>
        {isDirty && <span className="text-muted-foreground text-sm">Unsaved changes</span>}
        <span className="flex-1" />
        {business && (
          <DeleteBusinessButton
            business={business}
            onDeleted={() => {
              leaving.current = true;
              navigate({ to: '/admin' });
            }}
          />
        )}
      </div>
    </form>
  );
}
