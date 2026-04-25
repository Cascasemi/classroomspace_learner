/**
 * ThemeContext — light / dark mode with localStorage persistence.
 *
 * Dark mode  : adds class "dark" to <html>
 * Light mode : removes class "dark" from <html>
 *
 * Default: dark (the original NeuroSpace aesthetic).
 */
import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'neurospace-theme';

interface ThemeContextValue {
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Initialise from localStorage; default to dark
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'dark';
    } catch {
      return true;
    }
  });

  // Sync the `dark` class on <html> whenever isDark changes
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // localStorage blocked — silently ignore
    }
  }, [isDark]);

  const toggle = () => setIsDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
