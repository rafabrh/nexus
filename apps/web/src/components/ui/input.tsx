'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, style, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-input px-3 text-base text-text-primary',
        'placeholder:text-text-muted',
        'focus:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      style={{
        background: '#0C0F12',
        border: '1px solid #1E2530',
        transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#0D9488';
        e.currentTarget.style.boxShadow =
          '0 0 0 3px rgba(13,148,136,0.12), 0 0 12px rgba(13,148,136,0.05)';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = '#1E2530';
        e.currentTarget.style.boxShadow = 'none';
        props.onBlur?.(e);
      }}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
