import React from 'react';
import { Activity, History, Users } from 'lucide-react';

import type { CorrelationResult } from '@/Interfaces';
import { pct } from '@/lib/format';
import { probabilityTone, toneChipClass, toneTextClass } from '@/lib/status';
import { cn } from '@/lib/utils';

interface CorrelationDiagramProps {
  correlation: CorrelationResult;
  className?: string;
}

function SourceCard({
  icon,
  title,
  lines,
  tone,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
  tone: 'critical' | 'warning' | 'info' | 'neutral' | 'accent';
  empty: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-sm border p-3', toneChipClass[tone])}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <span className="[&>svg]:size-4">{icon}</span>
        {title}
      </div>
      {lines.length ? (
        <ul className="flex flex-col gap-0.5 text-xs text-[var(--c3-style-basic-fg-primary)]">
          {lines.slice(0, 4).map((l) => (
            <li key={l} className="truncate">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">{empty}</p>
      )}
    </div>
  );
}

/**
 * Human + machine correlation engine view: sensor anomalies, student reports and maintenance
 * history converge on one incident with a stated confidence.
 */
export default function CorrelationDiagram({ correlation, className }: CorrelationDiagramProps) {
  const tone = probabilityTone(correlation.failureProbability);
  const machine = correlation.machineSignals.map((s) => `${s.signal} ${s.detail}`);
  const human = correlation.humanSignals.map((h) => `“${h.description}”`);
  const history = correlation.historicalSignal
    ? [`${correlation.historicalSignal.failureMode} — ${correlation.historicalSignal.serviceDate.slice(0, 10)}`]
    : [];
  return (
    <div className={cn('grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)]', className)}>
      <div className="flex flex-col gap-2">
        <SourceCard icon={<Activity />} title="Machine signal" tone={machine.length ? 'critical' : 'neutral'} lines={machine} empty="No active sensor anomaly" />
        <SourceCard icon={<Users />} title="Human signal" tone={human.length ? 'warning' : 'neutral'} lines={human} empty="No related reports" />
        <SourceCard icon={<History />} title="Historical signal" tone={history.length ? 'info' : 'neutral'} lines={history} empty="No matching prior failure" />
      </div>
      <div className="hidden items-center justify-center lg:flex" aria-hidden>
        <svg viewBox="0 0 72 240" width="72" height="240" className="text-[var(--c3-style-basic-fg-neutral)]">
          <path d="M4 40 C 40 40, 40 120, 68 120" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M4 120 L 68 120" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M4 200 C 40 200, 40 120, 68 120" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <polygon points="62,115 70,120 62,125" fill="currentColor" />
        </svg>
      </div>
      <div className={cn('flex flex-col justify-center gap-2 rounded-sm border p-4', toneChipClass[tone])}>
        <span className="text-[10px] font-semibold uppercase tracking-wider">{correlation.verdict}</span>
        <span className="text-lg font-semibold text-[var(--c3-style-basic-fg-primary)]">{correlation.assetName}</span>
        <div className="grid grid-cols-2 gap-2 text-xs text-[var(--c3-style-basic-fg-secondary)]">
          <div>
            <p className="uppercase tracking-wide">Correlation confidence</p>
            <p className={cn('ifx-tabular text-2xl font-semibold', toneTextClass[tone])}>{pct(correlation.confidence)}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide">Failure probability</p>
            <p className="ifx-tabular text-2xl font-semibold text-[var(--c3-style-basic-fg-primary)]">{pct(correlation.failureProbability)}</p>
          </div>
        </div>
        {correlation.probableFailure && (
          <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">
            Probable failure: <span className="font-semibold text-[var(--c3-style-basic-fg-primary)]">{correlation.probableFailure}</span>
          </p>
        )}
      </div>
    </div>
  );
}
