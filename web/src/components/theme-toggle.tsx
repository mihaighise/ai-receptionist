import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

// Light / Dark / System. Icons only by default; showLabels adds the words (for wide menus).
export function ThemeToggle({ showLabels = false, className }: { showLabels?: boolean; className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={theme}
      // Clicking the selected option again would clear it; keep a choice selected.
      onValueChange={(value) => value && setTheme(value as Theme)}
      aria-label="Theme"
      className={cn(showLabels && 'w-full', className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className={cn(showLabels && 'flex-1')}
        >
          <Icon />
          {showLabels && <span className="text-xs">{label}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
