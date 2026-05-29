/**
 * Button — componente unificado con sistema de variantes FIFA.
 *
 * Decision Context:
 * - Por qué CVA: class-variance-authority permite definir todas las variantes
 *   de botón en un solo lugar con tipado fuerte, sin duplicación de estilos
 *   en los componentes consumidores.
 * - Variante default (primary): gradiente naranja FIFA con sombra coloreada y
 *   micro-elevación al hover (-translate-y-0.5). Reemplaza el bg-primary plano
 *   para mayor profundidad visual.
 * - Variante secondary: glassmorphism (bg-card/80 + backdrop-blur) para que
 *   se integre sobre cualquier fondo oscuro o claro sin necesitar override manual.
 * - Variante outline: borde 2px con color primary, hover rellena con 10% de
 *   opacidad para no opacar el contenido detrás.
 * - rounded-xl como default (vs rounded-md anterior) para alinearse con el
 *   aesthetic moderno. Los tamaños sm usan rounded-lg para proporcionalidad.
 * - transition-all en vez de transition-colors para habilitar la animación
 *   del translate en el hover del primary/destructive.
 * - Previously fixed bugs: none relevant.
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-orange-700 hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5',
        destructive:
          'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:from-red-600 hover:to-red-700 hover:shadow-xl hover:shadow-red-500/30 hover:-translate-y-0.5',
        outline:
          'border-2 border-primary bg-transparent text-primary hover:bg-primary/10',
        secondary:
          'bg-card/80 backdrop-blur-sm border border-border/60 text-card-foreground hover:bg-card hover:border-border',
        ghost:
          'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-6 py-2.5',
        sm: 'h-8 rounded-lg px-4 py-2 text-xs',
        lg: 'h-12 px-8 py-3 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
