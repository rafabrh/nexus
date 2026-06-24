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
    background: 'var(--bg-active)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
  },
  primary: {
    background: 'color-mix(in srgb, var(--accent-500) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--accent-500) 20%, transparent)',
    color: 'var(--accent-500)',
  },
  success: {
    background: 'color-mix(in srgb, var(--success) 12%, transparent)',
    border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)',
    color: 'var(--success)',
  },
  warning: {
    background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
    border: '1px solid color-mix(in srgb, var(--warning) 20%, transparent)',
    color: 'var(--warning)',
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
