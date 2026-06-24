import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[];
  placeholder?: string;
  onValueChange?: (value: string) => void;
  /**
   * Optional leading icon (lucide-react component). Kept as a native <select> so
   * Playwright `selectOption` (e2e match/tournament filters) keeps working — the
   * icon is purely decorative and the option text shifts right via padding.
   */
  icon?: React.ReactNode;
}

function Select({
  className,
  options,
  placeholder,
  value,
  onValueChange,
  disabled,
  icon,
  ...props
}: SelectProps) {
  return (
    <div className={cn('relative min-w-0', className)}>
      {icon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground"
        >
          {icon}
        </span>
      )}
      <select
        data-slot="select"
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}
        className={cn(
          'border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full appearance-none rounded-md border py-1 pr-9 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          icon ? 'pl-9' : 'px-3',
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { Select };
