// The owner app's half of each skill (see types.ts; the server's half is in src/skills). A skill
// without an entry here can still be switched on; it just has no settings and a plain summary.

import { messagesSkill } from './messages';
import { transfersSkill } from './transfers';
import type { SkillUi } from './types';

const SKILLS: SkillUi[] = [messagesSkill, transfersSkill];

export const skillUi = (id: string): SkillUi =>
  SKILLS.find((skill) => skill.id === id) ?? { id, summary: (_settings, label) => label };
