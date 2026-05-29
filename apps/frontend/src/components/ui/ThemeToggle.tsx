/**
 * ThemeToggle — botón para cambiar entre tema oscuro y claro.
 *
 * Decision Context:
 * - Iconos: Sun para acción "cambiar a claro" (visible en dark), Moon para
 *   "cambiar a oscuro" (visible en light). El ícono visible indica el tema
 *   ACTUAL, no el destino, siguiendo la convención de Gmail/VS Code.
 * - Tamaño 9×9 (36px): suficiente para target táctil sin ocupar mucho espacio
 *   en el header. El estilo glassmorphism lo integra con el navbar.
 * - client:load en el Astro consumer: el componente necesita acceso a
 *   localStorage y window, por eso requiere hidratación en el cliente.
 * - Previously fixed bugs: none relevant.
 */

import * as React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Evita hydration mismatch: renderiza solo tras mount en cliente
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-card/60 backdrop-blur-sm',
          className
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro'}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-card/60 text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-card hover:text-foreground',
        className
      )}
    >
      {theme === 'dark' ? (
        <Sun size={16} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Moon size={16} strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}
