/**
 * Badge — variantes con color tintado (semi-transparente).
 *
 * Decision Context:
 * - Cambio de sólido a tintado: bg-primary (naranja sólido) era demasiado
 *   agresivo sobre fondos oscuros/claros. El tinted approach
 *   (bg-primary/10 + border + text-primary) es más sutil y funciona igual
 *   de bien en ambos temas via CSS variables.
 * - rounded-full en lugar de rounded-md: más "pill-like", coherente con
 *   el aesthetic moderno del design system actualizado.
 * - Previously fixed bugs: none relevant.
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-primary/25 bg-primary/10 text-primary',
        secondary:
          'border-secondary/25 bg-secondary/10 text-secondary',
        destructive:
          'border-destructive/25 bg-destructive/10 text-destructive',
        outline:
          'border-border text-foreground bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
