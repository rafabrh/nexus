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
        background: 'var(--control-fill)',
        border: '1px solid var(--border-default)',
        boxShadow: 'inset 0 1px 2px var(--control-shadow)',
        transition: 'border-color 150ms var(--ease-out-expo), box-shadow 150ms var(--ease-out-expo)',
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent-500)';
        e.currentTarget.style.boxShadow =
          'inset 0 1px 2px var(--control-shadow), 0 0 0 3px color-mix(in srgb, var(--accent-500) 20%, transparent)';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.boxShadow = 'inset 0 1px 2px var(--control-shadow)';
        props.onBlur?.(e);
      }}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
