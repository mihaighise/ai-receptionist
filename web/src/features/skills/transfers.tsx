import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import type { SkillUi } from './types';

// Transfer callers to a person (src/skills/transfers.js).
export const transfersSkill: SkillUi = {
  id: 'transfers',
  Settings: ({ form }) => {
    const {
      register,
      formState: { errors },
    } = form;
    return (
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
    );
  },
  check: (values) =>
    values.transfer_number.trim() ? {} : { transfer_number: 'Enter the number to transfer callers to.' },
  summary: (settings, label) => `${label} at ${settings.transfer_number}`,
};
