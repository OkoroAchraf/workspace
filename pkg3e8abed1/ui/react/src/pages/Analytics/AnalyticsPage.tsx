import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { AnalyticsSummary } from '@/Interfaces';
import KpiTile from '@/components/illinifix/KpiTile';
import Panel from '@/components/illinifix/Panel';
import { DemoDataTag, ErrorState, LoadingState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { useApiData } from '@/hooks/useApiData';
import { num } from '@/lib/format';
import { ASSET_TYPE_LABEL, healthTone, statusTone, toneColor } from '@/lib/status';
import { api } from '@/shared/api';

const TOOLTIP_STYLE = { background: 'var(--c3-style-basic-bg-primary)', border: '1px solid var(--c3-style-basic-border-border)', borderRadius: 4, fontSize: 12 };

/** Feature 14 — maintenance impact analytics (all figures labelled as simulated / projected). */
export default function AnalyticsPage() {
  const { refreshKey } = useIlliniFix();
  const summary = useApiData<AnalyticsSummary>(() => api.getAnalyticsSummary(), [refreshKey]);
  const s = summary.data;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ifx-accent)]">Why the intelligence layer matters</p>
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Maintenance Impact Analytics</h1>
            <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">Detection, triage and prevention metrics computed from the IlliniFix data model. Projected benefits are demo / simulated estimates — not realised university savings.</p>
          </div>
          <DemoDataTag />
        </header>
      </div>

      <div className="flex flex-col gap-4 p-6">
        {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}
        {summary.loading && !s && <LoadingState label="Computing analytics…" />}
        {s && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <KpiTile label="Assets monitored" value={s.assetsMonitored} caption={`${s.sensorsMonitored} sensors · 7 days hourly`} tone="info" />
              <KpiTile label="Anomalies detected" value={num(s.anomaliesDetected)} caption="readings with |z| > 2.5" tone="warning" />
              <KpiTile label="Predicted failures" value={s.predictedFailuresDetected} caption="assets with probability ≥ 50%" tone="critical" />
              <KpiTile label="Incidents prevented" value={s.incidentsPreventedSimulated} caption="simulated — caught before failure" tone="healthy" />
              <KpiTile label="Average asset health" value={num(s.averageAssetHealth, 1)} caption="/ 100 across the register" tone={healthTone(s.averageAssetHealth)} />
              <KpiTile label="Human/sensor correlations" value={s.humanMachineCorrelations} caption="reports confirming an anomaly" tone="accent" />
              <KpiTile label="Reports auto-classified" value={`${s.reportsAutoClassified} / ${s.reportsTotal}`} caption="category · severity · likely asset" tone="info" />
              <KpiTile label="Duplicates consolidated" value={s.duplicateReportsConsolidated} caption={`${s.incidentClusters} incident clusters`} tone="info" />
              <KpiTile label="High-risk without work order" value={s.highRiskWithoutWorkOrder} caption="predicted failures not yet actioned" tone={s.highRiskWithoutWorkOrder ? 'critical' : 'healthy'} />
              <KpiTile label="Projected downtime avoided" value={`${num(s.projectedDowntimeAvoidedHours, 0)} h`} caption="simulated estimate (probability × historical downtime)" tone="healthy" />
              <KpiTile label="Projected daily users protected" value={num(s.projectedDailyUsersProtected)} caption="simulated estimate" tone="healthy" />
              <KpiTile label="Predictive work orders" value={s.workOrdersFromPredictions} caption="created from predictions" tone="accent" />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Panel title="Average health by asset type" eyebrow="Fleet view" description="Bars show the mean health score; label shows assets currently at risk (≥ 50% failure probability).">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={s.healthByAssetType.map((h) => ({ ...h, label: ASSET_TYPE_LABEL[h.assetType] ?? h.assetType }))} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="var(--ifx-grid)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'var(--ifx-grid)' }} contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [num(value, 1), 'Average health']} />
                    <Bar dataKey="averageHealth" name="Average health" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: 'top', fill: 'var(--c3-style-basic-fg-secondary)', fontSize: 11, formatter: (v: number) => num(v, 0) }}>
                      {s.healthByAssetType.map((h) => (
                        <Cell key={h.assetType} fill={toneColor(healthTone(h.averageHealth))} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <ul className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--c3-style-basic-fg-secondary)]">
                  {s.healthByAssetType.map((h) => (
                    <li key={h.assetType}>
                      <span className="font-semibold text-[var(--c3-style-basic-fg-primary)]">{ASSET_TYPE_LABEL[h.assetType] ?? h.assetType}</span>: {h.count} assets, {h.atRisk} at risk
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Asset status distribution" eyebrow="Register" description="Status bands: 90+ Healthy · 75–89 Monitor · 50–74 Warning · below 50 Critical.">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={s.statusDistribution} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="var(--ifx-grid)" vertical={false} />
                    <XAxis dataKey="status" tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'var(--ifx-grid)' }} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="Assets" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: 'top', fill: 'var(--c3-style-basic-fg-secondary)', fontSize: 11 }}>
                      {s.statusDistribution.map((d) => (
                        <Cell key={d.status} fill={toneColor(statusTone(d.status))} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </div>
            <p className="text-xs text-[var(--c3-style-basic-fg-neutral)]">{s.disclaimer}</p>
          </>
        )}
      </div>
    </div>
  );
}
