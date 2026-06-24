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
        primary: 'text-white mirror mirror-sweep',
        secondary:
          'text-text-primary border border-border-default hover:text-text-primary mirror mirror-sweep',
        ghost: 'text-text-secondary hover:text-text-primary',
        glass: 'glass-popup text-text-primary rounded-pill mirror mirror-sweep',
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
    background:
      'linear-gradient(180deg, color-mix(in srgb, var(--accent-500) 88%, white), var(--accent-500))',
    color: '#fff',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3), var(--shadow-control)',
  },
  secondary: {
    background: 'var(--control-fill)',
    boxShadow: 'var(--shadow-control)',
    color: 'var(--text-primary)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
  },
  glass: {
    // backdrop-filter + @supports fallback is handled by .glass-popup CSS class
    // applied via className in the CVA variants below
    border: '1px solid var(--glass-border)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.4), var(--shadow-panel)',
    color: 'var(--text-primary)',
  },
};

const variantHover: Record<string, object> = {
  primary: {
    y: -1,
    boxShadow: '0 2px 8px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.3)',
  },
  secondary: {
    background: 'var(--bg-hover)',
  },
  ghost: {
    background: 'var(--bg-hover)',
  },
  glass: {
    background: 'color-mix(in srgb, var(--glass-bg) 90%, white 10%)',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size, style, children, ...props }, ref) => {
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
      >
        {/* Lift the label above the specular gloss/sweep overlays so the
            mirror effect never sits on top of text. */}
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {children}
        </span>
      </motion.button>
    );
  },
);
Button.displayName = 'Button';
