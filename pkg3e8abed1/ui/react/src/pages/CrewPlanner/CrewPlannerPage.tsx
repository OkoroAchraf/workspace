import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Route, Sparkles, Trash2, Wrench } from 'lucide-react';

import type { CrewRow, MaintenancePlanResult, WorkOrderRow } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import KpiTile from '@/components/illinifix/KpiTile';
import Panel from '@/components/illinifix/Panel';
import StatusBadge from '@/components/illinifix/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { useApiData } from '@/hooks/useApiData';
import { minutes, num, relativeTime, score } from '@/lib/format';
import { severityTone } from '@/lib/status';
import { api, errorMessage } from '@/shared/api';
import { cn } from '@/lib/utils';

/** Feature 10 — maintenance crew optimizer (greedy risk-reduction-per-hour heuristic). */
export default function CrewPlannerPage() {
  const { refreshKey, refresh, askAgent } = useIlliniFix();
  const crews = useApiData<CrewRow[]>(() => api.getAvailableCrews(), [refreshKey]);
  const openWork = useApiData<WorkOrderRow[]>(() => api.getWorkOrders('Open'), [refreshKey]);
  const current = useApiData<MaintenancePlanResult | null>(() => api.getCurrentPlan(), [refreshKey]);
  const [selected, setSelected] = useState<string[]>([]);
  const [shiftHours, setShiftHours] = useState(8);
  const [plan, setPlan] = useState<MaintenancePlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (crews.data && selected.length === 0) setSelected(crews.data.filter((c) => c.status !== 'OffShift' && c.status !== 'Unavailable').map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crews.data]);

  useEffect(() => {
    if (current.data) setPlan(current.data);
  }, [current.data]);

  const unassigned = useMemo(() => (openWork.data ?? []).filter((w) => !w.assignedCrewId || w.status === 'Draft' || w.status === 'Scheduled'), [openWork.data]);

  const optimize = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.optimizePlan(selected, shiftHours);
      setPlan(result);
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.clearPlan();
      setPlan(null);
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ifx-accent)]">Prescriptive AI</p>
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Crew Planner</h1>
            <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">
              Maximize priority-weighted risk reduction subject to crew skills, shift hours, job duration and travel time. Method: greedy heuristic (transparent, not a formal solver).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="soft" appearance="accent" leadingIcon={<Sparkles />} onClick={() => askAgent(`We only have ${selected.length} crews available today. What should we fix?`)}>
              Ask the agent
            </Button>
            {plan && (
              <Button size="sm" variant="outline" appearance="secondary" leadingIcon={<Trash2 />} disabled={busy} onClick={() => void clear()}>
                Clear plan
              </Button>
            )}
          </div>
        </header>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel title="Today's constraint" eyebrow="Inputs" description="The university cannot fix everything at once.">
            <div className="grid grid-cols-3 gap-2">
              <KpiTile label="Open issues" value={unassigned.length} caption="work orders to schedule" tone="warning" />
              <KpiTile label="Crews" value={selected.length} caption={`of ${crews.data?.length ?? 0} available`} tone="info" />
              <KpiTile
                label="Shift"
                value={
                  <span className="flex items-baseline gap-1">
                    <input
                      id="shift-hours"
                      type="number"
                      min={2}
                      max={12}
                      step={0.5}
                      value={shiftHours}
                      onChange={(e) => setShiftHours(Number(e.target.value) || 8)}
                      className="ifx-tabular w-16 rounded-xs border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-page)] px-1 text-2xl font-semibold text-[var(--c3-style-basic-fg-primary)]"
                      aria-label="Shift hours"
                    />
                    <span className="text-sm font-normal text-[var(--c3-style-basic-fg-neutral)]">h</span>
                  </span>
                }
                caption="working hours per crew"
              />
            </div>
            <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Crews on shift</h3>
            {crews.error && <ErrorState message={crews.error} onRetry={crews.reload} />}
            {crews.loading && !crews.data && <LoadingState />}
            <ul className="mt-1 flex flex-col gap-1.5">
              {(crews.data ?? []).map((c) => {
                const checked = selected.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className={cn('flex cursor-pointer items-center gap-3 rounded-xs border px-3 py-2', checked ? 'border-[var(--ifx-accent)]/60 bg-[var(--ifx-accent-soft)]' : 'border-[var(--c3-style-basic-border-border)]')}>
                      <input type="checkbox" checked={checked} onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))} className="size-4 accent-[var(--ifx-accent)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">{c.name}</span>
                        <span className="block text-xs text-[var(--c3-style-basic-fg-secondary)]">
                          {c.skills.join(' · ')} · starts at {c.currentBuildingName} · {c.shiftStart}–{c.shiftEnd} · lead {c.leadName}
                        </span>
                      </span>
                      <StatusBadge tone={c.status === 'Available' ? 'healthy' : 'monitor'} icon={false}>
                        {c.status}
                      </StatusBadge>
                    </label>
                  </li>
                );
              })}
            </ul>
            {error && <ErrorState message={error} className="mt-3" />}
            <Button className="mt-4 w-full" size="lg" appearance="accent" leadingIcon={<Route />} loading={busy} disabled={busy || selected.length === 0} onClick={() => void optimize()}>
              OPTIMIZE TODAY&apos;S PLAN
            </Button>
          </Panel>

          <div className="flex flex-col gap-4 xl:col-span-2">
            {!plan && !current.loading && <EmptyState title="No plan yet" hint="Choose the crews on shift and click OPTIMIZE TODAY'S PLAN to generate an assignment schedule." className="py-12" />}
            {current.loading && !plan && <LoadingState label="Loading current plan…" />}
            {plan && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiTile label="Scheduled" value={`${plan.scheduledCount} / ${plan.workOrderCount}`} caption={`${plan.unscheduledCount} unscheduled`} tone="accent" />
                  <KpiTile label="Risk reduced" value={num(plan.totalRiskReduction, 2)} caption="priority-weighted risk units" tone="healthy" />
                  <KpiTile
                    label="Campus health"
                    value={
                      <span>
                        {score(plan.currentCampusHealth)} → <span className="text-[var(--ifx-healthy)]">{score(plan.projectedCampusHealth)}</span>
                      </span>
                    }
                    caption="projected after plan completes"
                  />
                  <KpiTile
                    label="Critical assets"
                    value={
                      <span>
                        {plan.currentCriticalAssets} → <span className="text-[var(--ifx-healthy)]">{plan.projectedCriticalAssets}</span>
                      </span>
                    }
                    caption="projected state"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {plan.crews.map((c) => (
                    <Panel key={c.crewId} title={c.crewName.toUpperCase()} eyebrow={c.skills.join(' · ')} description={`${c.startBuilding} start · ${c.hoursUsed} h scheduled · ${c.hoursRemaining} h remaining`}>
                      {c.jobs.length === 0 && <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">No feasible job for this crew&apos;s skills.</p>}
                      <ol className="relative flex flex-col gap-2 border-l border-[var(--c3-style-basic-border-border)] pl-4">
                        {c.jobs.map((j) => (
                          <li key={j.workOrderId} className="relative">
                            <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-[var(--ifx-accent)]" aria-hidden />
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="ifx-tabular text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">
                                {j.startLabel}
                                <span className="text-xs font-normal text-[var(--c3-style-basic-fg-neutral)]"> – {j.endLabel}</span>
                              </span>
                              <StatusBadge tone={severityTone(j.priority)} icon={false}>
                                {j.priority}
                              </StatusBadge>
                            </div>
                            <p className="text-sm text-[var(--c3-style-basic-fg-primary)]">
                              {j.assetId ? (
                                <Link to={`/assets/${j.assetId}`} className="hover:underline">
                                  {j.title}
                                </Link>
                              ) : (
                                j.title
                              )}
                            </p>
                            <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">
                              {j.buildingName} · {minutes(j.estimatedDuration)} · travel {j.travelTimeMinutes} min · priority {score(j.priorityScore)}
                              {j.riskReduction ? ` · risk −${num(j.riskReduction, 2)}` : ''}
                            </p>
                          </li>
                        ))}
                      </ol>
                    </Panel>
                  ))}
                </div>
                {plan.unscheduled.length > 0 && (
                  <Panel title="Not scheduled today" eyebrow={`${plan.unscheduled.length} work orders`} description="Jobs that no selected crew can take (skill mismatch) or that do not fit in the remaining shift hours.">
                    <ul className="flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]">
                      {plan.unscheduled.map((u) => (
                        <li key={u.workOrderId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[var(--c3-style-basic-fg-primary)]">{u.title}</span>
                            <span className="block text-xs text-[var(--c3-style-basic-fg-secondary)]">
                              {u.buildingName} · {u.requiredSkill} · {minutes(u.estimatedDuration)}
                            </span>
                          </span>
                          <span className="text-xs text-[var(--ifx-warning)]">{u.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
                <p className="flex items-start gap-2 text-xs text-[var(--c3-style-basic-fg-neutral)]">
                  <Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">{plan.method}</span> — {plan.methodDescription} Generated {relativeTime(plan.generatedAt)}.
                  </span>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
