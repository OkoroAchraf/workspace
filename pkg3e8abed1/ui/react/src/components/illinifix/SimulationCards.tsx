import React from 'react';

import type { FailureSimulation, RepairSimulation } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import Panel from '@/components/illinifix/Panel';
import { minutes, num, pct, score, signed } from '@/lib/format';
import { impactTone, toneTextClass } from '@/lib/status';
import { cn } from '@/lib/utils';

export function Stat({ label, value, sub, tone, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-sm border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] p-3', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">{label}</p>
      <p className={cn('ifx-tabular mt-1 text-2xl font-semibold text-[var(--c3-style-basic-fg-primary)]', tone)}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-[var(--c3-style-basic-fg-secondary)]">{sub}</p>}
    </div>
  );
}

/** Feature 11 — failure blast radius ("what happens if we do nothing?"). */
export function FailureSimulationCard({ sim, onClose }: { sim: FailureSimulation; onClose?: () => void }) {
  return (
    <Panel
      eyebrow="Simulation — does not change the real asset state"
      title={<span className="text-[var(--ifx-critical)]">{sim.assetName.toUpperCase()} OFFLINE</span>}
      description={sim.headline}
      actions={
        onClose ? (
          <Button size="sm" variant="ghost" appearance="secondary" onClick={onClose}>
            Dismiss
          </Button>
        ) : undefined
      }
      className="border-[var(--ifx-critical)]/50"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Daily users affected" value={num(sim.impacts.peopleAffected)} />
        <Stat label="Accessibility impact" value={sim.impacts.impactLevel} tone={toneTextClass[impactTone(sim.impacts.impactLevel)]} sub={`asset rating ${sim.impacts.accessibilityImpact}`} />
        <Stat
          label="Alternative utilization"
          value={sim.impacts.alternativeUtilizationIncreasePct !== null ? `+${sim.impacts.alternativeUtilizationIncreasePct}%` : 'None'}
          sub={sim.impacts.alternativesCount ? sim.impacts.alternativeNames.join(', ') : 'No alternative asset — full loss of service'}
        />
        <Stat label="Impacted floors" value={sim.impacts.impactedFloors ?? '—'} sub={sim.zoneName ?? undefined} />
        <Stat label="Est. downtime" value={`${num(sim.impacts.estimatedDowntimeHours, 0)} h`} sub="from corrective history" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat
          label="Building health"
          value={
            <span>
              {score(sim.before.buildingHealth)} → <span className="text-[var(--ifx-critical)]">{score(sim.after.buildingHealth)}</span>
            </span>
          }
        />
        <Stat
          label="Campus health"
          value={
            <span>
              {score(sim.before.campusHealth)} → <span className="text-[var(--ifx-critical)]">{score(sim.after.campusHealth)}</span>
            </span>
          }
        />
        <Stat
          label="Critical assets"
          value={
            <span>
              {sim.before.criticalAssets} → <span className="text-[var(--ifx-critical)]">{sim.after.criticalAssets}</span>
            </span>
          }
          sub={`people at risk ${num(sim.before.peopleAtRisk)} → ${num(sim.after.peopleAtRisk)}`}
        />
      </div>
      <p className="mt-3 text-xs text-[var(--c3-style-basic-fg-neutral)]">Maintenance priority if this occurs: {sim.impacts.maintenancePriority}. Simulated demo estimate.</p>
    </Panel>
  );
}

/** Feature 12 — what-if repair: projected campus KPIs after the recommended action. */
export function RepairSimulationCard({ sim, onClose }: { sim: RepairSimulation; onClose?: () => void }) {
  return (
    <Panel
      eyebrow="What-if repair — projected state"
      title={<span className="text-[var(--ifx-healthy)]">Repair {sim.assetName}</span>}
      description={sim.recommendedAction ?? undefined}
      actions={
        onClose ? (
          <Button size="sm" variant="ghost" appearance="secondary" onClick={onClose}>
            Dismiss
          </Button>
        ) : undefined
      }
      className="border-[var(--ifx-healthy)]/50"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Campus health"
          value={
            <span>
              {score(sim.before.campusHealth)} → <span className="text-[var(--ifx-healthy)]">{score(sim.after.campusHealth)}</span>
            </span>
          }
          sub={signed(sim.deltas.campusHealth, 1, ' pts')}
        />
        <Stat
          label="Critical assets"
          value={
            <span>
              {sim.before.criticalAssets} → <span className="text-[var(--ifx-healthy)]">{sim.after.criticalAssets}</span>
            </span>
          }
          sub={signed(sim.deltas.criticalAssets)}
        />
        <Stat
          label="People at risk"
          value={
            <span>
              {num(sim.before.peopleAtRisk)} → <span className="text-[var(--ifx-healthy)]">{num(sim.after.peopleAtRisk)}</span>
            </span>
          }
          sub={`${signed(sim.deltas.peopleAtRisk)} people/day`}
        />
        <Stat
          label="Failure probability"
          value={
            <span>
              {pct(sim.before.failureProbability)} → <span className="text-[var(--ifx-healthy)]">{pct(sim.after.failureProbability)}</span>
            </span>
          }
          sub={sim.estimatedInspectionDuration ? `~${minutes(sim.estimatedInspectionDuration)} of work` : undefined}
        />
      </div>
    </Panel>
  );
}
