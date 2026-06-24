'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { cardEntrance } from '@/lib/motion-variants';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle: string;
  accentColor: string;
}

export function KpiCard({ icon: Icon, label, value, subtitle, accentColor }: KpiCardProps) {
  const valueRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // GSAP number counter — only for numeric values
  useEffect(() => {
    const el = valueRef.current;
    if (!el) return;

    const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.]/g, ''));
    if (isNaN(numericValue)) return;

    const prefix = String(value).match(/^[^0-9]*/)?.[0] ?? '';
    const suffix = String(value).match(/[^0-9.]*$/)?.[0] ?? '';
    const isInt = Number.isInteger(numericValue);

    const obj = { val: 0 };
    gsap.to(obj, {
      val: numericValue,
      duration: 1.2,
      ease: 'power2.out',
      snap: isInt ? { val: 1 } : undefined,
      onUpdate() {
        if (el) {
          el.textContent = prefix + (isInt ? Math.round(obj.val) : obj.val.toFixed(1)) + suffix;
        }
      },
    });
  }, [value]);

  return (
    <motion.div
      ref={cardRef}
      variants={cardEntrance}
      initial="initial"
      animate="animate"
      style={{
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(12px) saturate(1.4)',
        border: '1px solid var(--separator)',
        borderRadius: 'var(--radius-card)',
        padding: '16px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
        boxShadow: 'var(--shadow-control)',
      }}
      whileHover={{
        y: -2,
        transition: { duration: 0.2 },
      }}
    >
      <div className="flex items-center gap-3 mb-3" style={{ position: 'relative' }}>
        {/* Icon container */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-control)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
            border: '1px solid var(--border-default)',
            flexShrink: 0,
          }}
        >
          <Icon size={16} style={{ color: accentColor }} />
        </div>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>

      {/* Value */}
      <div
        ref={valueRef}
        className="text-text-primary"
        style={{
          fontFamily: 'Inter, sans-serif',
          fontWeight: 700,
          fontSize: '28px',
          letterSpacing: '-0.025em',
          position: 'relative',
        }}
      >
        {value}
      </div>

      <div className="text-xs text-text-muted mt-1" style={{ position: 'relative' }}>
        {subtitle}
      </div>
    </motion.div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(12px) saturate(1.4)',
        border: '1px solid var(--separator)',
        borderRadius: 'var(--radius-card)',
        padding: '16px',
        boxShadow: 'var(--shadow-control)',
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-control)' }} />
        <div className="h-3 w-20 skeleton" />
      </div>
      <div className="h-7 w-24 skeleton mb-1" />
      <div className="h-3 w-16 skeleton" />
    </div>
  );
}
