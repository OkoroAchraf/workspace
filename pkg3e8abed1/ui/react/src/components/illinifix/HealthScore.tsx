import React from 'react';

import { cn } from '@/lib/utils';
import { healthLabel, healthTone, toneColor, toneTextClass } from '@/lib/status';
import { score } from '@/lib/format';

interface HealthScoreProps {
  value: number | null | undefined;
  size?: number;
  label?: string;
  showLabel?: boolean;
  className?: string;
}

/**
 * Circular 0-100 health gauge. The ring colour follows the health band (90+ Healthy, 75-89
 * Monitor, 50-74 Warning, <50 Critical) and the band name is always rendered as text.
 */
export default function HealthScore({ value, size = 96, label, showLabel = true, className }: HealthScoreProps) {
  const tone = healthTone(value);
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const dash = (v / 100) * c;
  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className="relative" aria-label={`Health score ${score(value)} of 100`} role="img">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ifx-grid)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={toneColor(tone)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('ifx-tabular font-semibold leading-none text-[var(--c3-style-basic-fg-primary)]', size >= 96 ? 'text-3xl' : 'text-xl')}>
            {score(value)}
          </span>
          {size >= 96 && <span className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">/ 100</span>}
        </div>
      </div>
      {showLabel && (
        <span className={cn('text-xs font-semibold uppercase tracking-wide', toneTextClass[tone])}>{label ?? healthLabel(value)}</span>
      )}
    </div>
  );
}
