import React, { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardPlus, FlaskConical, Sparkles, Wrench } from 'lucide-react';

import type { AssetDetails, AssetTelemetry, CorrelationResult, FailureSimulation, RepairSimulation } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import CorrelationDiagram from '@/components/illinifix/CorrelationDiagram';
import HealthScore from '@/components/illinifix/HealthScore';
import Panel from '@/components/illinifix/Panel';
import PriorityBreakdown from '@/components/illinifix/PriorityBreakdown';
import { FailureSimulationCard, RepairSimulationCard, Stat } from '@/components/illinifix/SimulationCards';
import StatusBadge from '@/components/illinifix/StatusBadge';
import TelemetryChart from '@/components/illinifix/TelemetryChart';
import { DemoDataTag, EmptyState, ErrorState, LoadingState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { useApiData } from '@/hooks/useApiData';
import { dateOnly, daysBetween, minutes, num, pct, relativeTime, score, shortDateTime, yearsSince } from '@/lib/format';
import { ASSET_TYPE_LABEL, SERIES_COLORS, impactTone, probabilityTone, riskTone, severityTone, statusTone, toneTextClass, workOrderStatusTone } from '@/lib/status';
import { api, errorMessage } from '@/shared/api';
import { cn } from '@/lib/utils';

/** Features 3, 4, 8, 11, 12 — asset intelligence: telemetry, prediction, explanation, correlation, simulation. */
export default function AssetDetailPage() {
  const { assetId = '' } = useParams();
  const navigate = useNavigate();
  const { refreshKey, refresh, askAgent } = useIlliniFix();
  const details = useApiData<AssetDetails>(() => api.getAssetDetails(assetId), [assetId, refreshKey]);
  const telemetry = useApiData<AssetTelemetry>(() => api.getAssetTelemetry(assetId), [assetId, refreshKey]);
  const correlation = useApiData<CorrelationResult>(() => api.getCorrelation(assetId), [assetId, refreshKey]);
  const [failureSim, setFailureSim] = useState<FailureSimulation | null>(null);
  const [repairSim, setRepairSim] = useState<RepairSimulation | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = useCallback(async (name: string, fn: () => Promise<string | null>) => {
    setActionBusy(name);
    setActionError(null);
    try {
      const msg = await fn();
      setActionMessage(msg);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }, []);

  const a = details.data;
  const pred = a?.prediction ?? null;
  const rec = a?.recommendation ?? null;
  const overdueDays = a?.nextScheduledMaintenanceDate ? daysBetween(a.nextScheduledMaintenanceDate) : null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <Link to="/assets" className="inline-flex items-center gap-1 text-xs text-[var(--c3-style-basic-fg-secondary)] hover:text-[var(--c3-style-basic-fg-primary)]">
          <ArrowLeft className="size-3.5" aria-hidden /> Assets
        </Link>
        {details.error && <ErrorState message={details.error} onRetry={details.reload} />}
        {details.loading && !a && <LoadingState label="Loading asset…" />}
        {a && (
          <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ifx-accent)]">
                {ASSET_TYPE_LABEL[a.assetType] ?? a.assetType} · {a.buildingFullName}
                {a.zoneName ? ` · ${a.zoneName}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">{a.assetName}</h1>
                <StatusBadge tone={statusTone(a.status)} size="md" pulse>
                  {a.status}
                </StatusBadge>
                {pred && (
                  <StatusBadge tone={riskTone(pred.riskLevel)} size="md" icon={false}>
                    {pred.riskLevel} risk
                  </StatusBadge>
                )}
                <DemoDataTag />
              </div>
              <p className="mt-1 text-xs text-[var(--c3-style-basic-fg-secondary)]">
                {a.manufacturer} {a.modelNumber} · installed {dateOnly(a.installationDate)} ({yearsSince(a.installationDate)}) · last maintenance {dateOnly(a.lastMaintenanceDate)} · next PM{' '}
                {dateOnly(a.nextScheduledMaintenanceDate)}
                {overdueDays !== null && overdueDays > 0 && <span className="ml-1 font-semibold text-[var(--ifx-warning)]">({overdueDays} days overdue)</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                appearance="accent"
                leadingIcon={<ClipboardPlus />}
                loading={actionBusy === 'wo'}
                disabled={actionBusy !== null}
                onClick={() =>
                  void run('wo', async () => {
                    const wo = await api.createDraftWorkOrder(assetId);
                    refresh();
                    return `Draft work order ${wo.id} created: “${wo.title}” (${wo.priority}, ${wo.requiredSkill}, ~${minutes(wo.estimatedDuration)}). IlliniFix record only — not the university work-order system.`;
                  })
                }
              >
                Create draft work order
              </Button>
              <Button
                size="sm"
                variant="outline"
                appearance="danger"
                leadingIcon={<FlaskConical />}
                loading={actionBusy === 'fail'}
                disabled={actionBusy !== null}
                onClick={() =>
                  void run('fail', async () => {
                    const sim = await api.simulateAssetFailure(assetId);
                    setFailureSim(sim);
                    setRepairSim(null);
                    return null;
                  })
                }
              >
                Simulate failure
              </Button>
              <Button
                size="sm"
                variant="outline"
                appearance="success"
                leadingIcon={<Wrench />}
                loading={actionBusy === 'repair'}
                disabled={actionBusy !== null}
                onClick={() =>
                  void run('repair', async () => {
                    const sim = await api.simulateRepair(assetId);
                    setRepairSim(sim);
                    return null;
                  })
                }
              >
                Simulate repair
              </Button>
              <Button size="sm" variant="soft" appearance="accent" leadingIcon={<Sparkles />} onClick={() => askAgent(`Why is ${a.assetName} considered ${(pred?.riskLevel ?? 'at risk').toLowerCase()}?`)}>
                Ask why
              </Button>
            </div>
          </header>
        )}
      </div>

      {a && (
        <div className="flex flex-col gap-4 p-6">
          {actionError && <ErrorState message={actionError} />}
          {actionMessage && (
            <div className="rounded-sm border border-[var(--ifx-healthy)]/40 bg-[var(--ifx-healthy-soft)] px-3 py-2 text-sm text-[var(--c3-style-basic-fg-primary)]">
              {actionMessage}{' '}
              <button type="button" className="ml-2 text-xs underline" onClick={() => setActionMessage(null)}>
                dismiss
              </button>
            </div>
          )}
          {failureSim && <FailureSimulationCard sim={failureSim} onClose={() => setFailureSim(null)} />}
          {repairSim && <RepairSimulationCard sim={repairSim} onClose={() => setRepairSim(null)} />}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="flex items-center justify-center rounded-sm border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] p-3">
              <HealthScore value={a.healthScore} size={96} />
            </div>
            <Stat
              label="Failure risk"
              value={pct(pred?.failureProbability ?? a.failureProbability)}
              tone={toneTextClass[probabilityTone(pred?.failureProbability ?? a.failureProbability)]}
              sub={pred ? `window ${pred.predictedFailureWindow}` : 'no prediction yet'}
            />
            <Stat label="Estimated people affected" value={`${num(a.estimatedPeopleAffected)}/day`} sub={`accessibility impact ${a.accessibilityImpact}`} tone={toneTextClass[impactTone(a.accessibilityImpact)]} />
            <Stat label="Priority" value={score(a.priorityScore)} sub={`criticality ${a.assetCriticality}`} />
            <Stat label="Confidence" value={pct(pred?.confidence)} sub={pred?.modelVersion ?? undefined} />
            <Stat
              label="Supporting reports"
              value={a.supportingReportCount}
              sub={a.correlationConfidence ? `correlation ${pct(a.correlationConfidence)}` : 'no correlated reports'}
              tone={a.supportingReportCount ? 'text-[var(--ifx-warning)]' : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              title="Telemetry"
              eyebrow="Machine sensors · 7 days hourly"
              description="Green band = normal range (baseline ± 3σ); dashed line = baseline; red dots = anomalous readings; shaded = detected anomaly window."
              className="xl:col-span-2"
            >
              {telemetry.error && <ErrorState message={telemetry.error} onRetry={telemetry.reload} />}
              {telemetry.loading && !telemetry.data && <LoadingState label="Loading telemetry…" />}
              {telemetry.data && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {telemetry.data.sensors.map((s, i) => (
                    <TelemetryChart key={s.sensorId} series={s} color={SERIES_COLORS[i % SERIES_COLORS.length]} />
                  ))}
                  {!telemetry.data.sensors.length && <EmptyState title="No telemetry" hint="This asset has no sensors." />}
                </div>
              )}
            </Panel>

            <div className="flex flex-col gap-4">
              <Panel title="AI Findings" eyebrow="Evidence" description={pred ? `Generated ${relativeTime(pred.generatedAt)} · ${pred.modelVersion}` : undefined}>
                {pred ? (
                  <ol className="flex flex-col gap-2">
                    {pred.topContributingSignals.map((s, i) => (
                      <li key={`${s.signal}-${i}`} className="grid grid-cols-[20px_minmax(0,1fr)_auto] gap-2 text-sm">
                        <span className="ifx-tabular text-[var(--c3-style-basic-fg-neutral)]">{i + 1}.</span>
                        <span className="min-w-0 text-[var(--c3-style-basic-fg-primary)]">
                          <span className="font-semibold">{s.signal}</span> <span className="text-[var(--c3-style-basic-fg-secondary)]">{s.detail}</span>
                        </span>
                        <span className="ifx-tabular text-xs text-[var(--c3-style-basic-fg-neutral)]" title="logit contribution">
                          +{num(s.contribution, 2)}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState title="No prediction yet" />
                )}
                {pred && (
                  <div className="mt-4 rounded-sm bg-[var(--c3-style-basic-bg-secondary)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Likely cause</p>
                    <p className="text-lg font-semibold text-[var(--c3-style-basic-fg-primary)]">{pred.predictedFailureMode}</p>
                    <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">
                      Confidence {pct(pred.confidence)} · anomaly severity {num(pred.anomalyScore, 2)} · predicted window {pred.predictedFailureWindow}
                    </p>
                  </div>
                )}
              </Panel>

              <Panel title="Recommended Action" eyebrow="Prescriptive" className={cn(rec && (pred?.failureProbability ?? 0) >= 0.6 && 'border-[var(--ifx-accent)]/50')}>
                {rec ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">{rec.recommendedAction}</p>
                    <p className="text-sm text-[var(--ifx-accent)]">{rec.recommendedTimeframe}</p>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Estimated inspection</dt>
                        <dd className="text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">{minutes(rec.estimatedInspectionDuration)}</dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Required skill</dt>
                        <dd className="text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">{rec.requiredSkill}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Expected risk reduction</dt>
                        <dd className="text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">
                          {pct(pred?.failureProbability)} → <span className="text-[var(--ifx-healthy)]">{pct(rec.projectedFailureProbability)}</span>{' '}
                          <span className="text-xs font-normal text-[var(--c3-style-basic-fg-secondary)]">(−{pct(rec.expectedRiskReduction)} absolute)</span>
                        </dd>
                      </div>
                    </dl>
                    <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">Reason: {rec.reason}</p>
                    {a.openWorkOrders.length > 0 && (
                      <p className="text-xs text-[var(--ifx-healthy)]">
                        {a.openWorkOrders.length} open work order(s) already cover this asset ({a.openWorkOrders.map((w) => w.id).join(', ')}).
                      </p>
                    )}
                  </div>
                ) : (
                  <EmptyState title="No recommendation" />
                )}
              </Panel>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              title="Human + Machine Correlation"
              eyebrow="Correlation engine"
              description="Students and staff are treated as human sensors; their reports are matched to the machine telemetry of the most plausible asset."
              className="xl:col-span-2"
            >
              {correlation.error && <ErrorState message={correlation.error} onRetry={correlation.reload} />}
              {correlation.loading && !correlation.data && <LoadingState label="Correlating human and machine signals…" />}
              {correlation.data && <CorrelationDiagram correlation={correlation.data} />}
              {a.relatedReports.length > 0 && (
                <>
                  <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Related reports</h3>
                  <ul className="mt-1 flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]">
                    {a.relatedReports.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                        <span className="min-w-0 flex-1 text-[var(--c3-style-basic-fg-primary)]">“{r.description}”</span>
                        <StatusBadge tone={severityTone(r.severity)}>{r.severity ?? 'n/a'}</StatusBadge>
                        {r.relatedAnomaly && (
                          <StatusBadge tone="accent" icon={false}>
                            confirms anomaly {pct(r.correlationConfidence)}
                          </StatusBadge>
                        )}
                        <span className="text-xs text-[var(--c3-style-basic-fg-neutral)]">
                          {r.reporterType} · {relativeTime(r.timestamp)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
            <Panel title="Why this priority?" eyebrow="Explainable scoring">
              {pred ? <PriorityBreakdown score={a.priorityScore} breakdown={pred.priorityBreakdown} /> : <EmptyState title="No prediction yet" />}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Maintenance History" eyebrow="Memory" description="Corrective records whose failure mode matches the current prediction raise the history-match feature (H).">
              {a.maintenanceHistory.length ? (
                <ul className="flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]">
                  {a.maintenanceHistory.map((h) => (
                    <li key={h.id} className="grid grid-cols-[96px_minmax(0,1fr)_auto] gap-3 py-2 text-sm">
                      <span className="ifx-tabular text-xs text-[var(--c3-style-basic-fg-secondary)]">{dateOnly(h.serviceDate)}</span>
                      <span className="min-w-0">
                        <span className="block text-[var(--c3-style-basic-fg-primary)]">
                          <span className="font-semibold">{h.maintenanceType}</span>
                          {h.failureMode && (
                            <span className={cn('ml-1', h.failureMode === pred?.predictedFailureMode ? 'text-[var(--ifx-warning)]' : 'text-[var(--c3-style-basic-fg-secondary)]')}>· {h.failureMode}</span>
                          )}
                        </span>
                        <span className="block text-xs text-[var(--c3-style-basic-fg-secondary)]">{h.description}</span>
                      </span>
                      <span className="ifx-tabular text-right text-xs text-[var(--c3-style-basic-fg-secondary)]">
                        {num(h.downtimeHours, 0)} h down · ${num(h.cost, 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No maintenance history" />
              )}
            </Panel>
            <Panel
              title="Work Orders"
              eyebrow="Execution"
              actions={
                <Button size="sm" variant="ghost" appearance="secondary" onClick={() => navigate('/work-orders')}>
                  All work orders
                </Button>
              }
            >
              {a.workOrders.length ? (
                <ul className="flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]">
                  {a.workOrders.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[var(--c3-style-basic-fg-primary)]">{w.title}</span>
                        <span className="block text-xs text-[var(--c3-style-basic-fg-secondary)]">
                          {w.id} · {w.source} · {w.requiredSkill} · {minutes(w.estimatedDuration)} · {shortDateTime(w.createdAt)}
                        </span>
                      </span>
                      <StatusBadge tone={severityTone(w.priority)} icon={false}>
                        {w.priority}
                      </StatusBadge>
                      <StatusBadge tone={workOrderStatusTone(w.status)} icon={false}>
                        {w.status}
                      </StatusBadge>
                      {w.assignedCrewName && <span className="text-xs text-[var(--c3-style-basic-fg-secondary)]">{w.assignedCrewName}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No work orders for this asset" hint="Create a draft work order from the prediction above." />
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
