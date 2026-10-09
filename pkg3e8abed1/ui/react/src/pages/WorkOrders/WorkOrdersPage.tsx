import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { CrewRow, WorkOrderRow } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DataGrid, DataGridBody, DataGridCell, DataGridHead, DataGridHeader, DataGridRow } from '@/components/ui/data-grid';
import KpiTile from '@/components/illinifix/KpiTile';
import Panel from '@/components/illinifix/Panel';
import StatusBadge from '@/components/illinifix/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { useApiData } from '@/hooks/useApiData';
import { minutes, score, shortDateTime } from '@/lib/format';
import { priorityScoreTone, severityTone, toneTextClass, workOrderStatusTone } from '@/lib/status';
import { api, errorMessage, type WorkOrderFilter } from '@/shared/api';
import { cn } from '@/lib/utils';

const FILTERS: { id: WorkOrderFilter; label: string }[] = [
  { id: 'Open', label: 'Open' },
  { id: 'Critical', label: 'Critical / High' },
  { id: 'PredictedFailure', label: 'Predicted failure' },
  { id: 'StudentReport', label: 'Student report' },
  { id: 'Unassigned', label: 'Unassigned' },
  { id: 'InProgress', label: 'In progress' },
  { id: 'Completed', label: 'Completed' },
  { id: 'All', label: 'All' },
];

const SOURCE_LABEL: Record<string, string> = { StudentReport: 'Student report', PredictedFailure: 'Predicted failure', Manual: 'Manual', PreventiveMaintenance: 'Preventive' };

/** Feature 13 — work order management (IlliniFix records only). */
export default function WorkOrdersPage() {
  const { refreshKey, refresh } = useIlliniFix();
  const [filter, setFilter] = useState<WorkOrderFilter>('Open');
  const workOrders = useApiData<WorkOrderRow[]>(() => api.getWorkOrders(filter), [filter, refreshKey]);
  const crews = useApiData<CrewRow[]>(() => api.getAvailableCrews(), [refreshKey]);
  const all = useApiData<WorkOrderRow[]>(() => api.getWorkOrders('All'), [refreshKey]);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [crewChoice, setCrewChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (all.data ?? []).forEach((w) => {
      c[w.status] = (c[w.status] ?? 0) + 1;
    });
    return c;
  }, [all.data]);

  const mutate = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      setAssignFor(null);
      setCrewChoice(null);
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const crewOptions = useMemo(
    () => (crews.data ?? []).map((c) => ({ value: c.id, label: c.name, subLabel: `${c.skills.join(', ')} · ${c.availableHours} h left · ${c.currentBuildingName ?? ''}` })),
    [crews.data],
  );

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ifx-accent)]">Execution</p>
          <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Work Orders</h1>
          <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">Close the loop between AI insight and operational execution. Work orders are IlliniFix records — the university&apos;s real work-order system is never modified.</p>
        </header>
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
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <KpiTile label="Draft" value={counts.Draft ?? 0} tone="neutral" />
          <KpiTile label="Scheduled" value={counts.Scheduled ?? 0} tone="info" />
          <KpiTile label="Assigned" value={counts.Assigned ?? 0} tone="monitor" />
          <KpiTile label="In progress" value={counts.InProgress ?? 0} tone="accent" />
          <KpiTile label="Completed" value={counts.Completed ?? 0} tone="healthy" />
          <KpiTile label="From predictions" value={(all.data ?? []).filter((w) => w.source === 'PredictedFailure').length} caption="predictive work orders" tone="warning" />
        </div>

        <Panel title="Work order queue" eyebrow={`${workOrders.data?.length ?? 0} shown`} contentClassName="overflow-x-auto">
          {error && <ErrorState message={error} />}
          {workOrders.error && <ErrorState message={workOrders.error} onRetry={workOrders.reload} />}
          {workOrders.loading && !workOrders.data && <LoadingState label="Loading work orders…" />}
          {workOrders.data && workOrders.data.length === 0 && <EmptyState title="No work orders in this view" />}
          {workOrders.data && workOrders.data.length > 0 && (
            <DataGrid className="w-full">
              <DataGridHeader>
                <DataGridRow>
                  <DataGridHead>ID</DataGridHead>
                  <DataGridHead>Work order</DataGridHead>
                  <DataGridHead>Building</DataGridHead>
                  <DataGridHead>Priority</DataGridHead>
                  <DataGridHead>Skill</DataGridHead>
                  <DataGridHead>Source</DataGridHead>
                  <DataGridHead>Status</DataGridHead>
                  <DataGridHead>Crew</DataGridHead>
                  <DataGridHead>Created</DataGridHead>
                  <DataGridHead align="right">Actions</DataGridHead>
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody>
                {workOrders.data.map((w) => (
                  <DataGridRow key={w.id}>
                    <DataGridCell>
                      <span className="ifx-tabular text-xs text-[var(--c3-style-basic-fg-secondary)]">{w.id}</span>
                    </DataGridCell>
                    <DataGridCell>
                      <span className="block max-w-[320px] truncate font-medium text-[var(--c3-style-basic-fg-primary)]">{w.title}</span>
                      <span className="block text-xs text-[var(--c3-style-basic-fg-secondary)]">
                        {w.assetId ? (
                          <Link to={`/assets/${w.assetId}`} className="text-[var(--ifx-accent)] hover:underline">
                            {w.assetName}
                          </Link>
                        ) : (
                          'Location-based'
                        )}
                        {' · '}
                        {minutes(w.estimatedDuration)}
                        {w.expectedRiskReduction ? ` · −${Math.round(w.expectedRiskReduction * 100)} pts risk` : ''}
                      </span>
                    </DataGridCell>
                    <DataGridCell>{w.buildingName}</DataGridCell>
                    <DataGridCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge tone={severityTone(w.priority)} icon={false}>
                          {w.priority}
                        </StatusBadge>
                        <span className={cn('ifx-tabular text-xs', toneTextClass[priorityScoreTone(w.priorityScore)])}>{score(w.priorityScore)}</span>
                      </div>
                    </DataGridCell>
                    <DataGridCell>{w.requiredSkill}</DataGridCell>
                    <DataGridCell>
                      <span className="text-xs">{SOURCE_LABEL[w.source] ?? w.source}</span>
                    </DataGridCell>
                    <DataGridCell>
                      <StatusBadge tone={workOrderStatusTone(w.status)} icon={false}>
                        {w.status === 'InProgress' ? 'In progress' : w.status}
                      </StatusBadge>
                    </DataGridCell>
                    <DataGridCell>
                      {assignFor === w.id ? (
                        <div className="flex min-w-[220px] items-center gap-1">
                          <Combobox size="sm" placeholder="Choose crew" options={crewOptions} value={crewChoice} onValueChange={setCrewChoice} />
                          <Button size="sm" appearance="accent" disabled={!crewChoice || busy === w.id} loading={busy === w.id} onClick={() => void mutate(w.id, () => api.assignCrew(w.id, crewChoice as string))}>
                            Assign
                          </Button>
                          <Button size="sm" variant="ghost" appearance="secondary" onClick={() => setAssignFor(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs">{w.assignedCrewName ?? <span className="text-[var(--c3-style-basic-fg-neutral)]">unassigned</span>}</span>
                      )}
                    </DataGridCell>
                    <DataGridCell>
                      <span className="text-xs text-[var(--c3-style-basic-fg-secondary)]">{shortDateTime(w.createdAt)}</span>
                    </DataGridCell>
                    <DataGridCell align="right">
                      <div className="flex justify-end gap-1">
                        {(w.status === 'Draft' || w.status === 'Scheduled') && assignFor !== w.id && (
                          <Button size="sm" variant="outline" appearance="secondary" disabled={busy !== null} onClick={() => setAssignFor(w.id)}>
                            Assign crew
                          </Button>
                        )}
                        {w.status === 'Assigned' && (
                          <Button size="sm" variant="outline" appearance="accent" disabled={busy !== null} loading={busy === w.id} onClick={() => void mutate(w.id, () => api.updateWorkOrderStatus(w.id, 'InProgress'))}>
                            Start
                          </Button>
                        )}
                        {w.status === 'InProgress' && (
                          <Button size="sm" variant="outline" appearance="success" disabled={busy !== null} loading={busy === w.id} onClick={() => void mutate(w.id, () => api.updateWorkOrderStatus(w.id, 'Completed'))}>
                            Complete
                          </Button>
                        )}
                      </div>
                    </DataGridCell>
                  </DataGridRow>
                ))}
              </DataGridBody>
            </DataGrid>
          )}
        </Panel>
      </div>
    </div>
  );
}
