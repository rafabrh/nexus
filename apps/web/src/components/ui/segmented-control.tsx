'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SegOption<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
  /**
   * Visual treatment of the sliding pill:
   * - `default` — flat `--control-fill` pill (settings, theme toggle).
   * - `mirror`  — glossy glass "mirror" pill with accent text and a specular
   *               edge, matching the top menu-bar tabs (`TopBar` NAV_TABS).
   *               Stretches to fill its container so it reads as a full-width
   *               segmented filter row.
   */
  variant?: 'default' | 'mirror';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  variant = 'default',
}: SegmentedControlProps<T>) {
  const groupId = useId();
  const mirror = variant === 'mirror';

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('relative inline-flex p-0.5 rounded-control', mirror && 'flex w-full')}
      style={{ background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)' }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative z-10 h-7 text-sm font-medium rounded-[5px] transition-colors focus-ring',
              mirror ? 'flex-1 px-2' : 'px-3',
            )}
            style={{
              color: active
                ? mirror
                  ? 'var(--accent-500)'
                  : 'var(--text-primary)'
                : 'var(--text-secondary)',
            }}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                className={cn('absolute inset-0 -z-10 rounded-[5px]', mirror && 'glass')}
                style={
                  mirror
                    ? {
                        // Same specular "mirror" recipe as the top menu-bar pill.
                        backgroundImage:
                          'linear-gradient(180deg, var(--mirror-sheen-top), transparent 60%)',
                        boxShadow:
                          'inset 0 1px 0 var(--mirror-edge), var(--shadow-control)',
                      }
                    : {
                        background: 'var(--control-fill)',
                        boxShadow: 'var(--shadow-control)',
                      }
                }
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
