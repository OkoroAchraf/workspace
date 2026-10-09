import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';

import type { AssetRow } from '@/Interfaces';
import { Input } from '@/components/ui/input';
import { DataGrid, DataGridBody, DataGridCell, DataGridHead, DataGridHeader, DataGridRow } from '@/components/ui/data-grid';
import Panel from '@/components/illinifix/Panel';
import StatusBadge from '@/components/illinifix/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { useApiData } from '@/hooks/useApiData';
import { dateOnly, daysBetween, pct, score } from '@/lib/format';
import { ASSET_TYPE_LABEL, healthTone, priorityScoreTone, probabilityTone, riskTone, statusTone, toneBgClass, toneTextClass } from '@/lib/status';
import { api } from '@/shared/api';
import { cn } from '@/lib/utils';

const STATUS_FILTERS = ['All', 'Critical', 'Warning', 'Monitor', 'Healthy'] as const;
const TYPE_FILTERS = ['All', 'Elevator', 'HVAC', 'Pump', 'Boiler', 'ElectricalPanel', 'Generator'] as const;
type SortKey = 'priority' | 'risk' | 'health' | 'name';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xs border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-[var(--ifx-accent)] bg-[var(--ifx-accent-soft)] text-[var(--ifx-accent)]'
          : 'border-[var(--c3-style-basic-border-border)] text-[var(--c3-style-basic-fg-secondary)] hover:text-[var(--c3-style-basic-fg-primary)]',
      )}
    >
      {children}
    </button>
  );
}

/** Assets list — every monitored asset with health, failure risk and priority. */
export default function AssetsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refreshKey } = useIlliniFix();
  const assets = useApiData<AssetRow[]>(() => api.getAssets(), [refreshKey]);
  const [status, setStatus] = useState<string>(params.get('status') ?? 'All');
  const [type, setType] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('priority');
  const riskParam = params.get('risk');

  const rows = useMemo(() => {
    const list = (assets.data ?? []).filter((a) => {
      if (status !== 'All' && a.status !== status) return false;
      if (type !== 'All' && a.assetType !== type) return false;
      if (riskParam === 'High' && (a.failureProbability ?? 0) < 0.5) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${a.assetName} ${a.buildingName ?? ''} ${a.zoneName ?? ''} ${a.predictedFailureMode ?? ''}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const sorted = [...list];
    sorted.sort((x, y) => {
      switch (sort) {
        case 'risk':
          return (y.failureProbability ?? 0) - (x.failureProbability ?? 0);
        case 'health':
          return (x.healthScore ?? 100) - (y.healthScore ?? 100);
        case 'name':
          return x.assetName.localeCompare(y.assetName);
        default:
          return y.priorityScore - x.priorityScore;
      }
    });
    return sorted;
  }, [assets.data, status, type, query, sort, riskParam]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (assets.data ?? []).forEach((a) => {
      c[a.status] = (c[a.status] ?? 0) + 1;
    });
    return c;
  }, [assets.data]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ifx-accent)]">Monitored equipment</p>
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Assets</h1>
            <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">
              {assets.data ? `${assets.data.length} assets · ${counts.Critical ?? 0} critical · ${counts.Warning ?? 0} warning · ${counts.Monitor ?? 0} monitor · ${counts.Healthy ?? 0} healthy` : 'Loading…'}
            </p>
          </div>
          <div className="w-full sm:w-72">
            <Input size="sm" placeholder="Search asset, building, failure mode" leftIcon={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </header>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Status</span>
            {STATUS_FILTERS.map((s) => (
              <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                {s}
                {s !== 'All' && counts[s] ? ` · ${counts[s]}` : ''}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Type</span>
            {TYPE_FILTERS.map((t) => (
              <Chip key={t} active={type === t} onClick={() => setType(t)}>
                {t === 'All' ? 'All' : ASSET_TYPE_LABEL[t] ?? t}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Sort</span>
            {(['priority', 'risk', 'health', 'name'] as SortKey[]).map((k) => (
              <Chip key={k} active={sort === k} onClick={() => setSort(k)}>
                {k === 'priority' ? 'Priority' : k === 'risk' ? 'Failure risk' : k === 'health' ? 'Health (worst first)' : 'Name'}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">
        <Panel title="Asset register" eyebrow={`${rows.length} shown`} description="Health, failure probability and priority are recomputed by the risk engine from telemetry, reports and history." contentClassName="overflow-x-auto">
          {assets.error && <ErrorState message={assets.error} onRetry={assets.reload} />}
          {assets.loading && !assets.data && <LoadingState label="Loading assets…" />}
          {assets.data && rows.length === 0 && <EmptyState title="No assets match the current filters" />}
          {assets.data && rows.length > 0 && (
            <DataGrid className="w-full">
              <DataGridHeader>
                <DataGridRow>
                  <DataGridHead>Asset</DataGridHead>
                  <DataGridHead>Building</DataGridHead>
                  <DataGridHead>Status</DataGridHead>
                  <DataGridHead>Health</DataGridHead>
                  <DataGridHead align="right">Failure risk</DataGridHead>
                  <DataGridHead align="right">Priority</DataGridHead>
                  <DataGridHead>Likely failure mode</DataGridHead>
                  <DataGridHead align="right">Reports</DataGridHead>
                  <DataGridHead>Next PM</DataGridHead>
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody>
                {rows.map((a) => {
                  const overdue = a.nextScheduledMaintenanceDate ? daysBetween(a.nextScheduledMaintenanceDate) : null;
                  return (
                    <DataGridRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/assets/${a.id}`)}>
                      <DataGridCell>
                        <span className="block font-medium text-[var(--c3-style-basic-fg-primary)]">{a.assetName}</span>
                        <span className="block text-xs text-[var(--c3-style-basic-fg-secondary)]">
                          {ASSET_TYPE_LABEL[a.assetType] ?? a.assetType}
                          {a.zoneName ? ` · ${a.zoneName}` : ''}
                        </span>
                      </DataGridCell>
                      <DataGridCell>{a.buildingName}</DataGridCell>
                      <DataGridCell>
                        <StatusBadge tone={statusTone(a.status)}>{a.status}</StatusBadge>
                      </DataGridCell>
                      <DataGridCell>
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--ifx-grid)]">
                            <span className={cn('block h-full rounded-full', toneBgClass[healthTone(a.healthScore)])} style={{ width: `${Math.max(0, Math.min(100, a.healthScore ?? 0))}%` }} />
                          </span>
                          <span className={cn('ifx-tabular text-sm font-semibold', toneTextClass[healthTone(a.healthScore)])}>{score(a.healthScore)}</span>
                        </div>
                      </DataGridCell>
                      <DataGridCell align="right">
                        <span className={cn('ifx-tabular font-semibold', toneTextClass[probabilityTone(a.failureProbability)])}>{pct(a.failureProbability)}</span>
                        {a.riskLevel && (
                          <span className={cn('ml-1 text-[10px] uppercase', toneTextClass[riskTone(a.riskLevel)])}>{a.riskLevel}</span>
                        )}
                      </DataGridCell>
                      <DataGridCell align="right">
                        <span className={cn('ifx-tabular text-lg font-semibold', toneTextClass[priorityScoreTone(a.priorityScore)])}>{score(a.priorityScore)}</span>
                      </DataGridCell>
                      <DataGridCell>
                        <span className="text-xs text-[var(--c3-style-basic-fg-secondary)]">{a.predictedFailureMode ?? '—'}</span>
                      </DataGridCell>
                      <DataGridCell align="right">
                        <span className="ifx-tabular">{a.supportingReportCount}</span>
                      </DataGridCell>
                      <DataGridCell>
                        <span className={cn('text-xs', overdue !== null && overdue > 0 ? 'font-semibold text-[var(--ifx-warning)]' : 'text-[var(--c3-style-basic-fg-secondary)]')}>
                          {dateOnly(a.nextScheduledMaintenanceDate)}
                          {overdue !== null && overdue > 0 ? ` (${overdue} d overdue)` : ''}
                        </span>
                      </DataGridCell>
                    </DataGridRow>
                  );
                })}
              </DataGridBody>
            </DataGrid>
          )}
        </Panel>
      </div>
    </div>
  );
}
