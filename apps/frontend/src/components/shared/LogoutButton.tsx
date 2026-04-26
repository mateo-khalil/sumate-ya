/**
 * LogoutButton — Client-side button that triggers logout via POST.
 *
 * Decision Context:
 * - Why: Provides a reusable logout action across the app (header, nav, mobile menu).
 * - Pattern: Uses form POST to `/api/auth/logout` for progressive enhancement — works without JS.
 *   Wrapped in a form so the server handles cookie clearing and redirect.
 * - Security: No JS fetch needed; form submission is handled server-side in the Astro API route.
 * - Previously fixed bugs: none relevant.
 */

import * as React from 'react';
import { Button, type ButtonProps } from '../ui/button';

export interface LogoutButtonProps extends Omit<ButtonProps, 'type'> {
  /** Displayed text inside the button. Defaults to "Cerrar sesión" */
  children?: React.ReactNode;
}

export function LogoutButton({
  children = 'Cerrar sesión',
  variant = 'ghost',
  size = 'sm',
  className,
  ...props
}: LogoutButtonProps) {
  return (
    <form action="/api/auth/logout" method="POST" className="inline">
      <Button type="submit" variant={variant} size={size} className={className} {...props}>
        {children}
      </Button>
    </form>
  );
}

export default LogoutButton;
