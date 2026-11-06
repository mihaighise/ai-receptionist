import { FormField } from '@/components/form-field';
import { PhoneField } from '@/components/phone-input';
import { Input } from '@/components/ui/input';
import { formatPhone } from '@/lib/phone';
import type { SkillUi } from './types';

// Take messages for the staff (src/skills/messages.js).
export const messagesSkill: SkillUi = {
  id: 'messages',
  Settings: ({ form, placeholders }) => {
    const {
      register,
      control,
      formState: { errors },
    } = form;
    return (
      <fieldset className="grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <legend className="px-1 font-medium text-sm">Messages</legend>
        <p className="text-muted-foreground text-sm sm:col-span-2">
          When a caller wants to book, needs a callback or asks for something it can't answer, the receptionist takes a
          message and sends it to you as soon as the call ends.
        </p>
        <FormField label="Text messages to" htmlFor="notify_sms" error={errors.notify_sms?.message}>
          <PhoneField control={control} name="notify_sms" id="notify_sms" invalid={!!errors.notify_sms} />
        </FormField>
        <FormField label="WhatsApp messages to" htmlFor="notify_whatsapp" error={errors.notify_whatsapp?.message}>
          <PhoneField
            control={control}
            name="notify_whatsapp"
            id="notify_whatsapp"
            invalid={!!errors.notify_whatsapp}
          />
        </FormField>
        <FormField
          label="Mark a message urgent if…"
          htmlFor="urgent_when"
          className="sm:col-span-2"
          hint="Optional. Urgent messages are flagged so you see them first."
        >
          <Input id="urgent_when" placeholder={placeholders.urgent_when} {...register('urgent_when')} />
        </FormField>
      </fieldset>
    );
  },
  check: (values) =>
    values.notify_sms.trim() || values.notify_whatsapp.trim()
      ? {}
      : { notify_sms: 'Enter a number to send messages to, by SMS or WhatsApp.' },
  summary: (settings, label) =>
    `${label}, sent to ${[
      settings.notify_sms && `${formatPhone(settings.notify_sms)} by text`,
      settings.notify_whatsapp && `${formatPhone(settings.notify_whatsapp)} on WhatsApp`,
    ]
      .filter(Boolean)
      .join(' and ')}`,
};
