'use client';

import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-600 text-text-primary hover:bg-primary-500 active:bg-primary-700',
        secondary:
          'bg-bg-elevated text-text-secondary border border-border hover:bg-bg-hover hover:text-text-primary active:bg-bg-active',
        ghost:
          'text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-active',
        danger:
          'bg-error/10 text-error hover:bg-error/20 active:bg-error/30',
        success:
          'bg-success/10 text-success hover:bg-success/20 active:bg-success/30',
      },
      size: {
        xs: 'h-6 px-2 text-xs rounded-badge',
        sm: 'h-8 px-3 text-sm rounded-input',
        md: 'h-9 px-4 text-base rounded-input',
        lg: 'h-10 px-5 text-md rounded-input',
        icon: 'h-8 w-8 rounded-input',
        'icon-sm': 'h-6 w-6 rounded-badge',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
