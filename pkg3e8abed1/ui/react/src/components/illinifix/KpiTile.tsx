import React from 'react';

import { MetricCard, MetricCardCaption, MetricCardHeader, MetricCardLabel, MetricCardValue } from '@/components/ui/metric-card';
import { cn } from '@/lib/utils';
import { Tone, toneTextClass } from '@/lib/status';

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  emphasis?: boolean;
}

/**
 * Large-number KPI tile for the command center. Built on the design-system MetricCard; the value
 * colour carries the tone while the label stays in neutral ink.
 */
export default function KpiTile({ label, value, caption, tone = 'neutral', icon, onClick, className, emphasis = false }: KpiTileProps) {
  return (
    <MetricCard
      interactive={Boolean(onClick)}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick();
      }}
      className={cn('min-w-0 rounded-sm bg-[var(--c3-style-basic-bg-primary)]', emphasis && 'border-[var(--ifx-accent)]/50', className)}
    >
      <MetricCardHeader>
        <MetricCardLabel className="text-[11px] uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">{label}</MetricCardLabel>
        {icon && <span className={cn('inline-flex shrink-0 [&>svg]:size-4', toneTextClass[tone])}>{icon}</span>}
      </MetricCardHeader>
      <MetricCardValue className={cn('ifx-tabular text-3xl font-semibold', tone !== 'neutral' && toneTextClass[tone])}>{value}</MetricCardValue>
      {caption && <MetricCardCaption className="text-[var(--c3-style-basic-fg-secondary)]">{caption}</MetricCardCaption>}
    </MetricCard>
  );
}
