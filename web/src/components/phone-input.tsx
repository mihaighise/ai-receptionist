import { getExampleNumber } from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';
import { ChevronDown } from 'lucide-react';
import { type Ref, useEffect, useRef, useState } from 'react';
import { type Control, Controller, type FieldPath, type FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { COUNTRIES, countryOf, joinPhone, splitPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

interface PhoneInputProps {
  id?: string;
  // The full number with spaces ("+1 512 555 0100"), or ''.
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ref?: Ref<HTMLInputElement>;
  invalid?: boolean;
  disabled?: boolean;
  // The label of the country picker, for screen readers.
  countryLabel?: string;
}

// A phone number: the country (flag and calling code) on the left, the number on the right,
// with spaces added as it's typed. Pasting a full "+44..." number picks its country. The value
// is the whole number with spaces (lib/phone.ts); the API turns it into "+15125550100".
export function PhoneInput({
  id,
  value,
  onChange,
  onBlur,
  ref,
  invalid,
  disabled,
  countryLabel = 'Country',
}: PhoneInputProps) {
  const [state, setState] = useState(() => splitPhone(value));
  // The last value this input sent, to tell its own changes from new values coming in (a
  // business being loaded, the form being reset).
  const sent = useRef(value);
  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setState((current) => splitPhone(value, current.country));
  }, [value]);

  const update = (country: typeof state.country, typed: string) => {
    const next = joinPhone(country, typed);
    setState({ country: next.country, national: next.national });
    sent.current = next.value;
    onChange(next.value);
  };

  const country = countryOf(state.country);
  const example = getExampleNumber(country.code, examples)
    ?.formatInternational()
    .slice(`+${country.dial}`.length)
    .trim();

  return (
    <div className="flex min-w-0">
      {/* The native list of countries, laid over the flag and code it shows. */}
      <div
        className={cn(
          'relative flex shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 bg-muted/50 px-2.5 text-sm shadow-xs transition-[color,box-shadow] dark:bg-input/30',
          'has-focus-visible:z-10 has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
          invalid && 'border-destructive',
          disabled && 'opacity-50',
        )}
      >
        <span aria-hidden="true" className="text-base leading-none">
          {country.flag}
        </span>
        <span aria-hidden="true" className="tabular-nums">
          +{country.dial}
        </span>
        <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <select
          aria-label={countryLabel}
          value={country.code}
          disabled={disabled}
          onChange={(e) => update(e.target.value as typeof state.country, state.national)}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name} (+{c.dial})
            </option>
          ))}
        </select>
      </div>
      <Input
        id={id}
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={state.national}
        placeholder={example}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => update(state.country, e.target.value)}
        onBlur={onBlur}
        className="min-w-0 rounded-l-none tabular-nums"
      />
    </div>
  );
}

// A PhoneInput for a react-hook-form field.
export function PhoneField<T extends FieldValues>({
  control,
  name,
  id,
  invalid,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  id?: string;
  invalid?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <PhoneInput
          id={id}
          value={field.value ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          invalid={invalid}
        />
      )}
    />
  );
}
