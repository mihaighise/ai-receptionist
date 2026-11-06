import { FormField } from '@/components/form-field';
import { PhoneField } from '@/components/phone-input';
import { formatPhone } from '@/lib/phone';
import type { SkillUi } from './types';

// Transfer callers to a person (src/skills/transfers.js).
export const transfersSkill: SkillUi = {
  id: 'transfers',
  Settings: ({ form }) => {
    const {
      control,
      formState: { errors },
    } = form;
    return (
      <fieldset className="grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <legend className="px-1 font-medium text-sm">Transfers</legend>
        <p className="text-muted-foreground text-sm sm:col-span-2">
          When a caller asks for a person, or something urgent can't wait, the receptionist puts them through.
        </p>
        <FormField label="Transfer callers to" htmlFor="transfer_number" error={errors.transfer_number?.message}>
          <PhoneField
            control={control}
            name="transfer_number"
            id="transfer_number"
            invalid={!!errors.transfer_number}
          />
        </FormField>
      </fieldset>
    );
  },
  check: (values) =>
    values.transfer_number.trim() ? {} : { transfer_number: 'Enter the number to transfer callers to.' },
  summary: (settings, label) => `${label} at ${formatPhone(settings.transfer_number)}`,
};
