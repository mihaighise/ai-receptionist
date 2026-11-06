// Light, dark or the device's setting. The choice is kept in this browser (localStorage) and shown
// by the "dark" class on <html>, which the dark: styles in index.css follow. index.html applies it
// before the page first draws, so dark mode never flashes white; keep the two in step.

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'bivoz-theme';
const THEMES: Theme[] = ['light', 'dark', 'system'];

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

// The saved choice, or 'system'. Storage can be blocked (private windows), so failures are ignored.
export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(value as Theme) ? (value as Theme) : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not saved; the choice still applies until the page is closed.
  }
}

// 'system' -> what the device uses now.
export const resolveTheme = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? (darkQuery().matches ? 'dark' : 'light') : theme;

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  // Native parts of the page (scrollbars, date pickers) follow too.
  root.style.colorScheme = resolved;
}

// Calls onChange when the device switches between light and dark.
export function watchSystemTheme(onChange: () => void) {
  const query = darkQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
