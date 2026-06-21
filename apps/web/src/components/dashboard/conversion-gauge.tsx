'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';

interface ConversionGaugeProps {
  /** 0–100 */
  value: number;
  label?: string;
  subtitle?: string;
}

const glassStyle: React.CSSProperties = {
  background: 'rgba(20,24,32,0.72)',
  backdropFilter: 'blur(12px) saturate(1.2)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '16px',
};

// Geometry — a 270° arc (gap at the bottom) reads as a gauge, not a full ring.
const SIZE = 132;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const ARC_FRACTION = 0.75; // 270°
const ARC_LEN = CIRC * ARC_FRACTION;

export function ConversionGauge({ value, label = 'Conversão', subtitle }: ConversionGaugeProps) {
  const arcRef = useRef<SVGCircleElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const clamped = Math.max(0, Math.min(100, value));

  useEffect(() => {
    const arc = arcRef.current;
    if (arc) {
      // Fill the visible arc proportionally to the value.
      const filled = ARC_LEN * (clamped / 100);
      gsap.fromTo(
        arc,
        { strokeDasharray: `0 ${CIRC}` },
        {
          strokeDasharray: `${filled} ${CIRC}`,
          duration: 1.1,
          ease: 'power3.out',
        },
      );
    }
    if (numRef.current) {
      const obj = { v: 0 };
      gsap.to(obj, {
        v: clamped,
        duration: 1.1,
        ease: 'power3.out',
        onUpdate: () => {
          if (numRef.current) numRef.current.textContent = String(Math.round(obj.v));
        },
      });
    }
  }, [clamped]);

  // Rotate so the 270° arc opens at the bottom and starts bottom-left.
  const rotation = 135;

  return (
    <div style={glassStyle} className="flex flex-col items-center">
      <div className="self-start text-sm font-medium text-text-secondary mb-2">{label}</div>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="block">
          <defs>
            <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2DD4BF" />
              <stop offset="100%" stopColor="#0D9488" />
            </linearGradient>
            <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g transform={`rotate(${rotation} ${SIZE / 2} ${SIZE / 2})`}>
            {/* Track */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${ARC_LEN} ${CIRC}`}
            />
            {/* Progress arc */}
            <circle
              ref={arcRef}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="url(#gauge-grad)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`0 ${CIRC}`}
              filter="url(#gauge-glow)"
            />
          </g>
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex items-baseline">
            <span
              ref={numRef}
              className="text-text-primary tabular-nums"
              style={{ fontWeight: 700, fontSize: 30, letterSpacing: '-0.03em' }}
            >
              0
            </span>
            <span className="text-text-secondary text-lg font-semibold">%</span>
          </div>
          {subtitle && <span className="text-[10px] text-text-muted mt-0.5">{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}
