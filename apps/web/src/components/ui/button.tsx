'use client';

import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base',
  {
    variants: {
      variant: {
        primary: 'text-[#0C0F12]',
        secondary: 'text-text-secondary border hover:text-text-primary',
        ghost: 'text-text-secondary hover:text-text-primary',
        danger: 'bg-error/10 text-error hover:bg-error/20 active:bg-error/30',
        success: 'bg-success/10 text-success hover:bg-success/20 active:bg-success/30',
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
  extends Omit<HTMLMotionProps<'button'>, 'children'>,
    VariantProps<typeof buttonVariants> {
  children?: React.ReactNode;
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #14B8A6, #10B981)',
    color: '#0C0F12',
  },
  secondary: {
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(20,24,32,0.5)',
  },
  ghost: {
    background: 'transparent',
  },
};

const variantHover: Record<string, object> = {
  primary: {
    boxShadow: 'var(--glow-primary)',
    y: -1,
    background: 'linear-gradient(135deg, #2DD4BF, #34D399)',
  },
  secondary: {
    borderColor: 'rgba(255,255,255,0.12)',
    background: 'rgba(31,39,51,0.6)',
  },
  ghost: {
    background: 'rgba(31,39,51,0.4)',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size, style, ...props }, ref) => {
    const resolvedVariant = variant ?? 'primary';
    const baseStyle = variantStyles[resolvedVariant] ?? {};
    const hoverStyle = variantHover[resolvedVariant] ?? {};

    return (
      <motion.button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        style={{
          transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
          ...baseStyle,
          ...style,
        }}
        whileTap={{ scale: 0.97 }}
        whileHover={hoverStyle as Record<string, string | number>}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
