'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-input bg-bg-elevated border border-border px-3 text-base text-text-primary',
        'placeholder:text-text-muted',
        'focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600/30',
        'transition-colors duration-150 ease-out',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
