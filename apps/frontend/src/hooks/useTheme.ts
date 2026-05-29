/**
 * useTheme — hook para el sistema de temas oscuro/claro.
 *
 * Decision Context:
 * - Dark-first: el tema oscuro es el default de la app (sin clase en <html>).
 *   El tema claro es opt-in y se activa agregando la clase .light al elemento
 *   raíz. Esta decisión evita romper todos los estilos existentes (diseñados
 *   en modo oscuro) al hacer el cambio incremental.
 * - localStorage key 'sumateyaTheme': namespaced para evitar conflictos con
 *   otras apps en el mismo dominio de desarrollo.
 * - prefers-color-scheme se lee solo si no hay valor guardado en localStorage,
 *   respetando así la preferencia explícita del usuario sobre la del sistema.
 * - El script inline en Layout.astro ya aplica la clase inicial antes del
 *   primer paint; useTheme sincroniza el estado React con esa clase.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'sumateyaTheme';

function readStoredTheme(): Theme | null {
  if (typeof localStorage === 'undefined') return null;
  const val = localStorage.getItem(STORAGE_KEY);
  return val === 'light' || val === 'dark' ? val : null;
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    // SSR-safe: default a dark en el servidor
    if (typeof window === 'undefined') return 'dark';
    const stored = readStoredTheme();
    return stored ?? getSystemTheme();
  });

  // Sincronizar con la clase que el script inline pudo haber aplicado ya
  useEffect(() => {
    const stored = readStoredTheme();
    const resolved = stored ?? getSystemTheme();
    setThemeState(resolved);
    applyTheme(resolved);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, toggleTheme, setTheme };
}
