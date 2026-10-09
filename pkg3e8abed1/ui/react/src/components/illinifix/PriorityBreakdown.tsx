import React from 'react';

import type { PriorityFactor } from '@/Interfaces';
import { num, score } from '@/lib/format';
import { priorityScoreTone, toneBgClass, toneTextClass } from '@/lib/status';
import { cn } from '@/lib/utils';

interface PriorityBreakdownProps {
  score: number | null | undefined;
  breakdown: PriorityFactor[];
  className?: string;
}

/**
 * "Why 94?" — the weighted factors behind a maintenance priority score, each as a bar whose
 * length is the points it contributed (out of its maximum weight × 100).
 */
export default function PriorityBreakdown({ score: total, breakdown, className }: PriorityBreakdownProps) {
  const tone = priorityScoreTone(total);
  const factors = breakdown.filter((b) => b.weight > 0);
  const notes = breakdown.filter((b) => b.weight === 0);
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Why</span>
        <span className={cn('ifx-tabular text-4xl font-semibold leading-none', toneTextClass[tone])}>{score(total)}</span>
        <span className="text-xs text-[var(--c3-style-basic-fg-secondary)]">priority score · impact factors scale with failure likelihood</span>
      </div>
      <ul className="flex flex-col gap-2">
        {factors.map((b) => {
          const max = b.weight * 100;
          const widthPct = max ? Math.min(100, (b.points / max) * 100) : 0;
          return (
            <li key={b.factor} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="truncate text-sm text-[var(--c3-style-basic-fg-primary)]">{b.factor}</span>
                <span className="truncate text-xs text-[var(--c3-style-basic-fg-secondary)]">{b.detail}</span>
              </div>
              <span className="ifx-tabular w-20 text-right text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">
                {num(b.points, 1)} <span className="text-xs font-normal text-[var(--c3-style-basic-fg-neutral)]">/ {num(max, 0)}</span>
              </span>
              <div className="col-span-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ifx-grid)]">
                <div className={cn('h-full rounded-full', toneBgClass[tone])} style={{ width: `${widthPct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-[var(--c3-style-basic-fg-secondary)]">
          {notes.map((n) => (
            <li key={n.factor}>
              <span className="font-semibold text-[var(--c3-style-basic-fg-primary)]">{n.factor}:</span> {n.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
