'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils';
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
        background: 'rgba(20,24,32,0.72)',
        backdropFilter: 'blur(12px) saturate(1.2)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '16px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
      }}
      whileHover={{
        y: -3,
        borderColor: `${accentColor}66`,
        boxShadow: `0 10px 36px rgba(0,0,0,0.45), 0 0 38px 0 ${accentColor}44`,
        transition: { duration: 0.2 },
      }}
    >
      {/* Accent gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 30% 0%, ${accentColor}24 0%, transparent 65%)`,
          pointerEvents: 'none',
        }}
      />

      <div className="flex items-center gap-3 mb-3" style={{ position: 'relative' }}>
        {/* Icon container */}
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${accentColor}1a`,
            border: `1px solid ${accentColor}1f`,
            flexShrink: 0,
          }}
        >
          <Icon size={18} style={{ color: accentColor }} />
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
        background: 'rgba(20,24,32,0.72)',
        backdropFilter: 'blur(12px) saturate(1.2)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '16px',
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '10px' }} />
        <div className="h-3 w-20 skeleton" />
      </div>
      <div className="h-7 w-24 skeleton mb-1" />
      <div className="h-3 w-16 skeleton" />
    </div>
  );
}
