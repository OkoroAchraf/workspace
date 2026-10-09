import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import type { AssetRow, BuildingHealth, CampusHealth } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import CampusMap from '@/components/illinifix/CampusMap';
import HealthScore from '@/components/illinifix/HealthScore';
import Panel from '@/components/illinifix/Panel';
import StatusBadge from '@/components/illinifix/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { useApiData } from '@/hooks/useApiData';
import { pct, score } from '@/lib/format';
import { ASSET_TYPE_LABEL, probabilityTone, statusTone, toneTextClass } from '@/lib/status';
import { api } from '@/shared/api';
import { cn } from '@/lib/utils';

type MapFilter = 'All' | 'CriticalOnly' | 'Elevator' | 'HVAC' | 'Pump' | 'OpenWorkOrders' | 'StudentReports';

const FILTERS: { id: MapFilter; label: string }[] = [
  { id: 'All', label: 'All assets' },
  { id: 'CriticalOnly', label: 'Critical only' },
  { id: 'Elevator', label: 'Elevators' },
  { id: 'HVAC', label: 'HVAC' },
  { id: 'Pump', label: 'Pumps' },
  { id: 'OpenWorkOrders', label: 'Open work orders' },
  { id: 'StudentReports', label: 'Student reports' },
];

function matchesFilter(a: AssetRow, f: MapFilter): boolean {
  switch (f) {
    case 'CriticalOnly':
      return a.status === 'Critical' || a.riskLevel === 'Critical' || a.riskLevel === 'High';
    case 'Elevator':
    case 'HVAC':
    case 'Pump':
      return a.assetType === f;
    case 'OpenWorkOrders':
      return a.hasOpenWorkOrder;
    case 'StudentReports':
      return a.supportingReportCount > 0;
    default:
      return true;
  }
}

/** Feature 2 — Interactive Campus Asset Map with building drill-down. */
export default function CampusMapPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { refreshKey } = useIlliniFix();
  const [filter, setFilter] = useState<MapFilter>('All');
  const selectedId = params.get('building');

  const health = useApiData<CampusHealth>(() => api.getCampusHealth(), [refreshKey]);
  const assets = useApiData<AssetRow[]>(() => api.getAssets(), [refreshKey]);
  const building = useApiData<BuildingHealth | null>(() => (selectedId ? api.getBuildingHealth(selectedId) : Promise.resolve(null)), [selectedId, refreshKey]);

  useEffect(() => {
    if (!selectedId && health.data && health.data.buildings.length) {
      const worst = health.data.buildings.slice().sort((a, b) => a.overallHealthScore - b.overallHealthScore)[0];
      setParams({ building: worst.id }, { replace: true });
    }
  }, [selectedId, health.data, setParams]);

  const matchingAssets = useMemo(() => (assets.data ?? []).filter((a) => matchesFilter(a, filter)), [assets.data, filter]);
  const dimmedIds = useMemo(() => {
    if (!health.data || filter === 'All') return [];
    const withMatch = new Set(matchingAssets.map((a) => a.buildingId));
    return health.data.buildings.filter((b) => !withMatch.has(b.id)).map((b) => b.id);
  }, [health.data, matchingAssets, filter]);
  const buildingAssets = useMemo(() => (building.data ? building.data.assets.filter((a) => matchesFilter(a, filter)) : []), [building.data, filter]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ifx-accent)]">Spatial operations</p>
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Interactive Campus Asset Map</h1>
            <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">Buildings coloured by health status; click a building to see its assets, reports and predicted failures.</p>
          </div>
        </header>
        <div className="min-w-0 overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'rounded-xs border px-2.5 py-1 text-xs font-medium transition-colors',
                  filter === f.id
                    ? 'border-[var(--ifx-accent)] bg-[var(--ifx-accent-soft)] text-[var(--ifx-accent)]'
                    : 'border-[var(--c3-style-basic-border-border)] text-[var(--c3-style-basic-fg-secondary)] hover:text-[var(--c3-style-basic-fg-primary)]',
                )}
              >
                {f.label}
                {filter === f.id && assets.data ? ` · ${matchingAssets.length}` : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 p-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          {health.error && <ErrorState message={health.error} onRetry={health.reload} />}
          {health.loading && !health.data && <LoadingState label="Loading buildings…" />}
          {health.data && (
            <CampusMap
              buildings={health.data.buildings}
              selectedId={selectedId}
              dimmedIds={dimmedIds}
              onSelect={(b) => setParams({ building: b.id })}
              className="h-[520px] xl:h-[calc(100vh-260px)] xl:min-h-[480px]"
            />
          )}
        </div>

        <div className="min-w-0">
          {building.error && <ErrorState message={building.error} onRetry={building.reload} />}
          {building.loading && selectedId && <LoadingState label="Loading building…" />}
          {!selectedId && !health.loading && <EmptyState title="Select a building" hint="Click a marker on the map to open its health summary." />}
          {building.data && (
            <Panel
              eyebrow={building.data.address}
              title={building.data.name}
              description={`${building.data.estimatedDailyOccupancy.toLocaleString()} people/day · accessibility criticality ${building.data.accessibilityCriticality ?? '—'}`}
              actions={<StatusBadge tone={statusTone(building.data.healthStatus)} size="md" pulse>{building.data.healthStatus}</StatusBadge>}
            >
              <div className="flex items-center gap-4">
                <HealthScore value={building.data.overallHealthScore} size={88} label={`Building health ${score(building.data.overallHealthScore)}`} />
                <dl className="grid flex-1 grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Assets</dt>
                    <dd className="ifx-tabular text-lg font-semibold text-[var(--c3-style-basic-fg-primary)]">{building.data.assets.length}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Critical</dt>
                    <dd className={cn('ifx-tabular text-lg font-semibold', building.data.criticalAssetCount ? 'text-[var(--ifx-critical)]' : 'text-[var(--c3-style-basic-fg-primary)]')}>
                      {building.data.criticalAssetCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Active reports</dt>
                    <dd className="ifx-tabular text-lg font-semibold text-[var(--c3-style-basic-fg-primary)]">{building.data.activeReports}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Predicted failures</dt>
                    <dd className={cn('ifx-tabular text-lg font-semibold', building.data.predictedFailures ? 'text-[var(--ifx-warning)]' : 'text-[var(--c3-style-basic-fg-primary)]')}>
                      {building.data.predictedFailures}
                    </dd>
                  </div>
                </dl>
              </div>

              <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Assets {filter !== 'All' ? `(filtered: ${FILTERS.find((f) => f.id === filter)?.label})` : ''}</h3>
              <ul className="mt-1 flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]">
                {buildingAssets.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/assets/${a.id}`)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto_52px_16px] items-center gap-2 py-2 text-left hover:bg-[var(--c3-style-basic-bg-secondary)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--c3-style-basic-fg-primary)]">{a.assetName}</span>
                        <span className="block truncate text-xs text-[var(--c3-style-basic-fg-secondary)]">
                          {ASSET_TYPE_LABEL[a.assetType] ?? a.assetType}
                          {a.zoneName ? ` · ${a.zoneName}` : ''}
                          {a.supportingReportCount ? ` · ${a.supportingReportCount} report(s)` : ''}
                        </span>
                      </span>
                      <StatusBadge tone={statusTone(a.status)}>{a.status}</StatusBadge>
                      <span className={cn('ifx-tabular text-right text-sm font-semibold', toneTextClass[probabilityTone(a.failureProbability)])}>{pct(a.failureProbability)}</span>
                      <ChevronRight className="size-4 text-[var(--c3-style-basic-fg-neutral)]" aria-hidden />
                    </button>
                  </li>
                ))}
                {!buildingAssets.length && <li className="py-3 text-xs text-[var(--c3-style-basic-fg-secondary)]">No assets match this filter in {building.data.shortName}.</li>}
              </ul>

              {building.data.reports.length > 0 && (
                <>
                  <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Recent human reports</h3>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {building.data.reports.slice(0, 5).map((r) => (
                      <li key={r.id} className="rounded-xs bg-[var(--c3-style-basic-bg-secondary)] px-2 py-1.5 text-xs">
                        <span className="text-[var(--c3-style-basic-fg-primary)]">“{r.description}”</span>
                        <span className="ml-1 text-[var(--c3-style-basic-fg-neutral)]">
                          · {r.category ?? 'Unclassified'}
                          {r.relatedAnomaly ? ' · confirms sensor anomaly' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="mt-4 flex justify-end">
                <Button size="sm" variant="outline" appearance="secondary" onClick={() => navigate(`/reports?building=${building.data?.id ?? ''}`)}>
                  All reports for {building.data.shortName}
                </Button>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
