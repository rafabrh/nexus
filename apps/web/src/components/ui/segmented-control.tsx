'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';

export interface SegOption<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const groupId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative inline-flex p-0.5 rounded-control"
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
            className="relative z-10 px-3 h-7 text-sm font-medium rounded-[5px] transition-colors"
            style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                className="absolute inset-0 -z-10 rounded-[5px]"
                style={{
                  background: 'var(--control-fill)',
                  boxShadow: 'var(--shadow-control)',
                }}
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
