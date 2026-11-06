import type { ComponentType } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { BusinessSettings } from '@/api/owner';
import type { SetupValues } from '@/features/setup/setup-schema';

// The owner app's half of a skill (the server's half is in src/skills): what the setup shows and
// checks for it. Registered in index.ts.
export interface SkillUi {
  // The skill's id on the server.
  id: string;
  // Its settings in the setup's "What it does" step, shown while it's switched on. placeholders:
  // examples from the business type's template.
  Settings?: ComponentType<{ form: UseFormReturn<SetupValues>; placeholders: Record<string, string> }>;
  // Checks run in the browser before moving on (the API checks again): { field: message }.
  check?: (values: SetupValues) => Partial<Record<keyof SetupValues, string>>;
  // What it does, in a sentence, for the setup's review step. label: the skill's name.
  summary: (settings: BusinessSettings, label: string) => string;
}
