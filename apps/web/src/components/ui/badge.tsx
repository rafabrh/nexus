'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 font-medium rounded-badge px-1.5 py-0.5 text-xs leading-none whitespace-nowrap',
  {
    variants: {
      variant: {
        default: '',
        primary: '',
        success: '',
        warning: '',
        error: 'bg-error/15 text-error',
        info: 'bg-info/15 text-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const variantInlineStyles: Record<string, React.CSSProperties> = {
  default: {
    background: 'rgba(80,91,107,0.1)',
    border: '1px solid rgba(80,91,107,0.15)',
    color: '#505B6B',
  },
  primary: {
    background: 'rgba(45,212,191,0.08)',
    border: '1px solid rgba(45,212,191,0.16)',
    color: '#2DD4BF',
  },
  success: {
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.15)',
    color: '#22C55E',
  },
  warning: {
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.15)',
    color: '#F59E0B',
  },
};

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant = 'default', style, ...props }: BadgeProps) {
  const resolvedVariant = variant ?? 'default';
  const inlineStyle = variantInlineStyles[resolvedVariant] ?? {};

  return (
    <span
      className={cn(badgeVariants({ variant, className }))}
      style={{ ...inlineStyle, ...style }}
      {...props}
    />
  );
}
