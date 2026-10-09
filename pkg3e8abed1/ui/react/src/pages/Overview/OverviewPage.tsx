import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertOctagon, ClipboardList, MessageSquareWarning, Sparkles, TrendingDown, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { AssetRow, CampusHealth, RiskTrend } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import CampusMap from '@/components/illinifix/CampusMap';
import HealthScore from '@/components/illinifix/HealthScore';
import KpiTile from '@/components/illinifix/KpiTile';
import Panel from '@/components/illinifix/Panel';
import StatusBadge from '@/components/illinifix/StatusBadge';
import { DemoDataTag, ErrorState, LoadingState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { useApiData } from '@/hooks/useApiData';
import { num, pct, relativeTime, score } from '@/lib/format';
import { healthTone, priorityScoreTone, probabilityTone, riskTone, statusTone, toneColor, toneTextClass, workOrderStatusTone } from '@/lib/status';
import { api } from '@/shared/api';
import { cn } from '@/lib/utils';

function RiskRow({ rank, asset, onOpen }: { rank: number; asset: AssetRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[28px_minmax(0,1fr)_64px_56px] items-center gap-2 rounded-xs px-2 py-2 text-left transition-colors hover:bg-[var(--c3-style-basic-bg-secondary)]"
    >
      <span className="ifx-tabular text-sm font-semibold text-[var(--c3-style-basic-fg-neutral)]">{rank}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-[var(--c3-style-basic-fg-primary)]">{asset.assetName}</span>
        <span className="block truncate text-xs text-[var(--c3-style-basic-fg-secondary)]">
          {asset.buildingName} · {asset.predictedFailureMode ?? asset.assetType}
        </span>
      </span>
      <span className={cn('ifx-tabular text-right text-sm font-semibold', toneTextClass[probabilityTone(asset.failureProbability)])}>{pct(asset.failureProbability)}</span>
      <span className={cn('ifx-tabular text-right text-lg font-semibold', toneTextClass[priorityScoreTone(asset.priorityScore)])}>{score(asset.priorityScore)}</span>
    </button>
  );
}

function RiskTrendChart({ trend }: { trend: RiskTrend }) {
  const data = trend.days.map((d) => ({ ...d, label: d.day.slice(5) }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="var(--ifx-grid)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: 'var(--c3-style-basic-bg-primary)', border: '1px solid var(--c3-style-basic-border-border)', borderRadius: 4, fontSize: 12 }}
          labelStyle={{ color: 'var(--c3-style-basic-fg-secondary)' }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="criticalAssets" name="Critical (≥24 anomalies/day)" stroke="var(--ifx-critical)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="highRiskAssets" name="High risk (≥10)" stroke="var(--ifx-warning)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="elevatedAssets" name="Elevated (≥3)" stroke="var(--ifx-monitor)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function WorkOrderStatusChart({ counts }: { counts: CampusHealth['workOrderStatusCounts'] }) {
  const order: (keyof CampusHealth['workOrderStatusCounts'])[] = ['Draft', 'Scheduled', 'Assigned', 'InProgress', 'Completed', 'Cancelled'];
  const data = order.map((s) => ({ status: s === 'InProgress' ? 'In progress' : s, key: s, count: counts[s] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--ifx-grid)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="status" width={80} tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: 'var(--ifx-grid)' }}
          contentStyle={{ background: 'var(--c3-style-basic-bg-primary)', border: '1px solid var(--c3-style-basic-border-border)', borderRadius: 4, fontSize: 12 }}
        />
        <Bar dataKey="count" name="Work orders" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fill: 'var(--c3-style-basic-fg-secondary)', fontSize: 11 }}>
          {data.map((d) => (
            <Cell key={d.key} fill={toneColor(workOrderStatusTone(d.key))} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Feature 1 — Campus Maintenance Command Center. */
export default function OverviewPage() {
  const navigate = useNavigate();
  const { refreshKey, askAgent, initializing, initError } = useIlliniFix();
  const health = useApiData<CampusHealth>(() => api.getCampusHealth(), [refreshKey]);
  const trend = useApiData<RiskTrend>(() => api.getRiskTrend(), [refreshKey]);
  const data = health.data;

  const correlated = useMemo(() => (data ? data.topRisks.filter((r) => r.supportingReportCount > 0 && (r.failureProbability ?? 0) >= 0.5).length : 0), [data]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ifx-accent)]">Campus Operations</p>
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Campus Maintenance Command Center</h1>
            <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">
              Detect · Predict · Prioritize · Prevent — University of Illinois Urbana-Champaign{data ? ` · updated ${relativeTime(data.generatedAt)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DemoDataTag />
            <Button size="sm" variant="outline" appearance="secondary" onClick={() => health.reload()}>
              Refresh
            </Button>
            <Button size="sm" appearance="accent" leadingIcon={<Sparkles />} onClick={() => askAgent('What should we repair first today?')}>
              What should we fix first?
            </Button>
          </div>
        </header>
      </div>

      <div className="flex flex-col gap-4 p-6">
        {initializing && <LoadingState label="Initializing predictive models (first load runs triage + risk scoring)…" className="py-2" />}
        {initError && <ErrorState message={initError} />}
        {health.error && <ErrorState message={health.error} onRetry={health.reload} />}
        {health.loading && !data && <LoadingState label="Loading campus health…" />}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiTile
                label="Campus Health"
                value={
                  <span className="flex items-baseline gap-1">
                    <span className={toneTextClass[healthTone(data.campusHealthScore)]}>{score(data.campusHealthScore)}</span>
                    <span className="text-sm font-normal text-[var(--c3-style-basic-fg-neutral)]">/ 100</span>
                  </span>
                }
                caption={<span>{data.campusStatus} · {data.assetsMonitored} assets · {data.sensorsOnline} sensors</span>}
                icon={<Activity />}
                tone={healthTone(data.campusHealthScore)}
              />
              <KpiTile label="Critical Assets" value={data.criticalAssets} caption={`${data.highRiskAssets} high-risk`} tone={data.criticalAssets ? 'critical' : 'healthy'} icon={<AlertOctagon />} onClick={() => navigate('/assets?status=Critical')} />
              <KpiTile label="Predicted Failures" value={data.predictedFailures7d} caption="next 7 days · probability ≥ 50%" tone={data.predictedFailures7d ? 'warning' : 'healthy'} icon={<TrendingDown />} onClick={() => navigate('/assets?risk=High')} />
              <KpiTile label="Open Reports" value={data.openReports} caption={`${correlated} confirm a sensor anomaly`} tone="info" icon={<MessageSquareWarning />} onClick={() => navigate('/reports')} />
              <KpiTile label="Active Work Orders" value={data.activeWorkOrders} caption={`${data.workOrderStatusCounts.Draft ?? 0} draft · ${data.workOrderStatusCounts.InProgress ?? 0} in progress`} tone="accent" icon={<ClipboardList />} onClick={() => navigate('/work-orders')} />
              <KpiTile label="People at Risk" value={num(data.peopleAtRisk)} caption="people/day exposed to predicted failures" tone={data.peopleAtRisk ? 'warning' : 'healthy'} icon={<Users />} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Panel
                title="Campus Health Map"
                eyebrow="Spatial view"
                description="Marker colour = building health status; size = daily occupancy. Click a building to drill down."
                className="xl:col-span-2"
                actions={
                  <Button size="sm" variant="ghost" appearance="secondary" onClick={() => navigate('/map')}>
                    Open map
                  </Button>
                }
              >
                <CampusMap buildings={data.buildings} onSelect={(b) => navigate(`/map?building=${b.id}`)} className="h-[360px]" />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {data.buildings
                    .slice()
                    .sort((a, b) => a.overallHealthScore - b.overallHealthScore)
                    .map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => navigate(`/map?building=${b.id}`)}
                        className="flex items-center gap-2 rounded-xs border border-[var(--c3-style-basic-border-border)] px-2 py-1.5 text-left hover:bg-[var(--c3-style-basic-bg-secondary)]"
                      >
                        <HealthScore value={b.overallHealthScore} size={40} showLabel={false} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-[var(--c3-style-basic-fg-primary)]">{b.shortName}</span>
                          <span className={cn('block text-[10px] uppercase tracking-wide', toneTextClass[statusTone(b.healthStatus)])}>{b.healthStatus}</span>
                        </span>
                      </button>
                    ))}
                </div>
              </Panel>

              <Panel
                title="Highest Priority Issues"
                eyebrow="Prescriptive ranking"
                description="Priority = 35% failure risk · 20% criticality · 15% accessibility · 15% people · 10% operations · 5% reports"
                actions={
                  <Button size="sm" variant="ghost" appearance="secondary" onClick={() => navigate('/assets')}>
                    All assets
                  </Button>
                }
              >
                <div className="grid grid-cols-[28px_minmax(0,1fr)_64px_56px] gap-2 px-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">
                  <span>#</span>
                  <span>Asset</span>
                  <span className="text-right">Risk</span>
                  <span className="text-right">Priority</span>
                </div>
                <div className="flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]">
                  {data.topRisks.slice(0, 8).map((r, i) => (
                    <RiskRow key={r.id} rank={i + 1} asset={r} onOpen={() => navigate(`/assets/${r.id}`)} />
                  ))}
                </div>
                {data.topRisks[0] && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xs bg-[var(--c3-style-basic-bg-secondary)] p-2 text-xs text-[var(--c3-style-basic-fg-secondary)]">
                    <StatusBadge tone={riskTone(data.topRisks[0].riskLevel)}>{data.topRisks[0].riskLevel ?? 'Risk'}</StatusBadge>
                    <span className="min-w-0 flex-1 truncate">
                      {data.topRisks[0].assetName}: {data.topRisks[0].supportingReportCount} human report(s) corroborate the sensor anomaly
                    </span>
                    <Button size="sm" variant="ghost" appearance="accent" onClick={() => askAgent(`Why is ${data.topRisks[0].assetName} considered ${(data.topRisks[0].riskLevel ?? 'at risk').toLowerCase()}?`)}>
                      Ask why
                    </Button>
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Panel title="Failure Risk Trend" eyebrow="7 days" description="Assets with anomalous readings per day, derived from sensor telemetry (|z| > 2.5)." className="xl:col-span-1">
                {trend.error && <ErrorState message={trend.error} onRetry={trend.reload} />}
                {trend.loading && !trend.data && <LoadingState />}
                {trend.data && <RiskTrendChart trend={trend.data} />}
              </Panel>
              <Panel title="Work Order Status" eyebrow="Execution" description="IlliniFix work orders by lifecycle state.">
                <WorkOrderStatusChart counts={data.workOrderStatusCounts} />
              </Panel>
              <Panel title="Human Sensors" eyebrow="Open reports by category" description="Student and staff reports become structured telemetry through AI triage.">
                <ul className="flex flex-col gap-2">
                  {Object.entries(data.reportCategoryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => {
                      const max = Math.max(1, ...Object.values(data.reportCategoryCounts));
                      return (
                        <li key={cat} className="grid grid-cols-[88px_minmax(0,1fr)_28px] items-center gap-2 text-xs">
                          <span className="truncate text-[var(--c3-style-basic-fg-primary)]">{cat}</span>
                          <span className="h-2 w-full overflow-hidden rounded-full bg-[var(--ifx-grid)]">
                            <span className="block h-full rounded-full bg-[var(--ifx-info)]" style={{ width: `${(count / max) * 100}%` }} />
                          </span>
                          <span className="ifx-tabular text-right text-[var(--c3-style-basic-fg-secondary)]">{count}</span>
                        </li>
                      );
                    })}
                </ul>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-[var(--c3-style-basic-fg-secondary)]">{data.anomaliesDetected24h} sensor anomalies in the last 24 h</span>
                  <Button size="sm" variant="ghost" appearance="accent" onClick={() => navigate('/reports')}>
                    Triage queue
                  </Button>
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
