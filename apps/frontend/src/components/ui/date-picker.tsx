import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  onValueChange?: (value: string) => void;
}

function DatePicker({ className, value, onValueChange, ...props }: DatePickerProps) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <CalendarDays
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        data-slot="date-picker"
        type="date"
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        className="pl-10"
        {...props}
      />
    </div>
  );
}

export { DatePicker };
