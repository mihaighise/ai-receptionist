import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';
import { applyTheme, resolveTheme, savedTheme, saveTheme, type Theme, watchSystemTheme } from '@/lib/theme';

interface ThemeContextValue {
  // What the person chose.
  theme: Theme;
  // What's showing: 'system' resolved to light or dark.
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Keeps the page's theme in step with the person's choice and, for 'system', with the device.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(savedTheme);
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(theme));

  useEffect(() => {
    const update = () => {
      applyTheme(theme);
      setResolvedTheme(resolveTheme(theme));
    };
    update();
    return theme === 'system' ? watchSystemTheme(update) : undefined;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    saveTheme(next);
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const context = use(ThemeContext);
  if (!context) throw new Error('useTheme needs a ThemeProvider');
  return context;
}
