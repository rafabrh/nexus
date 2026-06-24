'use client';

import * as RadixSwitch from '@radix-ui/react-switch';

export interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Switch({ checked, onCheckedChange, disabled, 'aria-label': ariaLabel }: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className="relative inline-flex h-[25px] w-[42px] items-center rounded-pill disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
      style={{
        background: checked ? 'var(--accent-500)' : 'var(--bg-active)',
        transition: 'background 200ms var(--ease-out-expo)',
        flexShrink: 0,
      }}
    >
      <RadixSwitch.Thumb
        className="block h-5 w-5 rounded-full"
        style={{
          background: '#fff',
          boxShadow:
            '0 0 0 .5px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.2), 0 4px 8px rgba(0,0,0,.08)',
          transform: checked ? 'translateX(19px)' : 'translateX(3px)',
          transition: 'transform 200ms var(--ease-out-expo)',
        }}
      />
    </RadixSwitch.Root>
  );
}
