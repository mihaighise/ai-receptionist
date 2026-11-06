import { CalendarCheck, Plus, X } from 'lucide-react';
import { useMemo } from 'react';
import { Controller, useFieldArray, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { useCalendar, useChooseCalendar, useConnectCalendar, useDisconnectCalendar } from '@/api/owner';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { WEEKDAYS } from '@/features/setup/setup-schema';
import type { SkillUi } from './types';

const DAY_NAMES = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
const DURATIONS = [15, 20, 30, 45, 60, 90, 120, 180, 240];
const BUFFERS = [0, 10, 15, 30, 60];
const NOTICES = [0, 1, 2, 4, 12, 24, 48];
const HORIZONS = [7, 14, 30, 60, 90];

// 90 -> "1 h 30 min"
export const durationText = (minutes: number) =>
  [minutes >= 60 && `${Math.floor(minutes / 60)} h`, minutes % 60 && `${minutes % 60} min`].filter(Boolean).join(' ');

// A Select over numbers, for a form value that's a number.
function NumberSelect({
  value,
  onChange,
  choices,
  label,
  text,
}: {
  value: number;
  onChange: (value: number) => void;
  choices: number[];
  label: string;
  text: (n: number) => string;
}) {
  // A saved value that isn't one of the choices still shows.
  const all = choices.includes(value) ? choices : [...choices, value].sort((a, b) => a - b);
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {all.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {text(n)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Connecting Google Calendar, which bookings go into. Saved straight away, apart from the form.
function CalendarConnection() {
  const calendar = useCalendar();
  const choose = useChooseCalendar();
  const disconnect = useDisconnectCalendar();
  const connect = useConnectCalendar(({ ok, message }) =>
    ok ? toast.success('Your calendar is connected.') : toast.error(message ?? "Your calendar wasn't connected."),
  );

  if (calendar.isPending) return <Skeleton className="h-16 w-full" />;
  if (calendar.isError)
    return <p className="text-destructive text-sm">Couldn't load your calendar. Reload the page to try again.</p>;
  const status = calendar.data;
  if (!status.connected && !status.available) {
    return (
      <Alert>
        <AlertDescription>Google Calendar isn't set up on this server yet.</AlertDescription>
      </Alert>
    );
  }
  if (!status.connected) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-4">
        <p className="text-sm">
          Connect your Google Calendar. The receptionist only looks at when you're busy, and adds the appointments it
          books. Until it's connected, booking requests are taken as messages.
        </p>
        <Button type="button" onClick={connect}>
          <CalendarCheck /> Connect Google Calendar
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-md bg-muted/50 p-4">
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <CalendarCheck className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 truncate">
          Connected to <span className="font-medium">{status.email ?? 'Google Calendar'}</span>
        </span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="ml-auto h-auto px-0"
          disabled={disconnect.isPending}
          onClick={() =>
            disconnect.mutate(undefined, { onSuccess: () => toast.success('Your calendar is disconnected.') })
          }
        >
          Disconnect
        </Button>
      </p>
      {status.calendars && status.calendars.length > 1 && (
        <FormField label="Add appointments to" htmlFor="calendar_id">
          <Select
            value={status.calendarId}
            onValueChange={(id) => choose.mutate(id, { onError: (err) => toast.error(err.message) })}
          >
            <SelectTrigger id="calendar_id" className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {status.calendars.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.primary && ' (main)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
    </div>
  );
}

// Book appointments in the owner's calendar (src/skills/bookings).
export const bookingsSkill: SkillUi = {
  id: 'bookings',
  Settings: ({ form, type }) => {
    const {
      control,
      register,
      formState: { errors },
    } = form;
    const services = useFieldArray({ control, name: 'booking_settings.services' });
    const days = useWatch({ control, name: 'booking_settings.days' });
    const timeZones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);
    const error = errors.booking_settings?.message;
    const examples = type?.services ?? [];

    return (
      <fieldset className="flex min-w-0 flex-col gap-5 rounded-lg border p-4">
        <legend className="px-1 font-medium text-sm">Bookings</legend>
        <p className="text-muted-foreground text-sm">
          Callers can book an appointment during the call. The receptionist offers times that are free in your calendar
          and adds the booking to it.
        </p>
        <CalendarConnection />

        <div className="flex flex-col gap-2">
          <Label>What callers can book</Label>
          {services.fields.length === 0 && examples.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto self-start py-1.5 text-left font-normal whitespace-normal"
              onClick={() => services.replace(examples)}
            >
              <Plus /> Start with {examples.map((s) => `${s.name} (${durationText(s.minutes)})`).join(', ')}
            </Button>
          )}
          <ul className="flex flex-col gap-2" aria-label="What callers can book">
            {services.fields.map((field, index) => (
              <li key={field.id} className="flex items-center gap-2">
                <Input
                  aria-label="Appointment"
                  placeholder="e.g. Haircut"
                  className="min-w-0 flex-1"
                  {...register(`booking_settings.services.${index}.name`)}
                />
                <div className="w-28 shrink-0 sm:w-32">
                  <Controller
                    control={control}
                    name={`booking_settings.services.${index}.minutes`}
                    render={({ field: minutes }) => (
                      <NumberSelect
                        label="How long"
                        value={minutes.value}
                        onChange={minutes.onChange}
                        choices={DURATIONS}
                        text={durationText}
                      />
                    )}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove"
                  onClick={() => services.remove(index)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => services.append({ name: '', minutes: 30 })}
          >
            <Plus /> Add
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <Label>When appointments can be booked</Label>
          <ul className="flex flex-col gap-1.5">
            {WEEKDAYS.map((day) => (
              <li key={day} className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1">
                <Label className="w-32 cursor-pointer font-normal">
                  <Controller
                    control={control}
                    name={`booking_settings.days.${day}.open`}
                    render={({ field }) => (
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    )}
                  />
                  {DAY_NAMES[day]}
                </Label>
                {days[day].open ? (
                  <span className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${DAY_NAMES[day]} from`}
                      className="w-28 sm:w-32"
                      {...register(`booking_settings.days.${day}.from`)}
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input
                      type="time"
                      aria-label={`${DAY_NAMES[day]} to`}
                      className="w-28 sm:w-32"
                      {...register(`booking_settings.days.${day}.to`)}
                    />
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">Closed</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Time zone" htmlFor="booking_time_zone">
            <Controller
              control={control}
              name="booking_settings.timeZone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="booking_time_zone" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeZones.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone.replaceAll('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField label="Free time after each appointment">
            <Controller
              control={control}
              name="booking_settings.bufferMinutes"
              render={({ field }) => (
                <NumberSelect
                  label="Free time after each appointment"
                  value={field.value}
                  onChange={field.onChange}
                  choices={BUFFERS}
                  text={(n) => (n ? durationText(n) : 'None')}
                />
              )}
            />
          </FormField>
          <FormField label="Book no sooner than">
            <Controller
              control={control}
              name="booking_settings.noticeHours"
              render={({ field }) => (
                <NumberSelect
                  label="Book no sooner than"
                  value={field.value}
                  onChange={field.onChange}
                  choices={NOTICES}
                  text={(n) => (n ? `${n} hour${n === 1 ? '' : 's'} ahead` : 'Any time')}
                />
              )}
            />
          </FormField>
          <FormField label="Book up to">
            <Controller
              control={control}
              name="booking_settings.horizonDays"
              render={({ field }) => (
                <NumberSelect
                  label="Book up to"
                  value={field.value}
                  onChange={field.onChange}
                  choices={HORIZONS}
                  text={(n) => `${n} days ahead`}
                />
              )}
            />
          </FormField>
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </fieldset>
    );
  },
  check: ({ booking_settings: { services, days } }) => {
    const open = WEEKDAYS.filter((day) => days[day].open);
    if (!services.some((s) => s.name.trim())) {
      return { booking_settings: 'Add at least one thing callers can book, with how long it takes.' };
    }
    if (!open.length) return { booking_settings: 'Choose the days and hours appointments can be booked.' };
    const wrong = open.find((day) => !(days[day].from < days[day].to));
    return wrong ? { booking_settings: `On ${DAY_NAMES[wrong]}, the end time must be after the start.` } : {};
  },
  summary: (settings, label) => `${label}: ${settings.booking_settings.services.map((s) => s.name).join(', ')}`,
};
