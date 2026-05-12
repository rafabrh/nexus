'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle: string;
  accentColor: string;
}

export function KpiCard({ icon: Icon, label, value, subtitle, accentColor }: KpiCardProps) {
  return (
    <div className="bg-bg-surface border border-border rounded-card p-4 transition-colors duration-150 hover:border-border-hover">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-input flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          <Icon size={16} style={{ color: accentColor }} />
        </div>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-text-primary">{value}</div>
      <div className="text-xs text-text-muted mt-1">{subtitle}</div>
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="bg-bg-surface border border-border rounded-card p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 skeleton rounded-input" />
        <div className="h-3 w-20 skeleton" />
      </div>
      <div className="h-7 w-24 skeleton mb-1" />
      <div className="h-3 w-16 skeleton" />
    </div>
  );
}
