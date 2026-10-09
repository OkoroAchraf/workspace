import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, Wrench } from 'lucide-react';

import type { AssetRow, FailureSimulation, RepairSimulation, ScenarioRow } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import Panel from '@/components/illinifix/Panel';
import { FailureSimulationCard, RepairSimulationCard } from '@/components/illinifix/SimulationCards';
import StatusBadge from '@/components/illinifix/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { useApiData } from '@/hooks/useApiData';
import { pct, relativeTime } from '@/lib/format';
import { api, errorMessage } from '@/shared/api';

function isFailure(s: ScenarioRow['resultSummary']): s is FailureSimulation {
  return !!s && s.scenarioType === 'AssetFailure';
}

function isRepair(s: ScenarioRow['resultSummary']): s is RepairSimulation {
  return !!s && s.scenarioType === 'AssetRepair';
}

/** Features 11 + 12 — failure blast radius and what-if repair simulations. */
export default function SimulationsPage() {
  const { refreshKey, refresh } = useIlliniFix();
  const assets = useApiData<AssetRow[]>(() => api.getAssets(), [refreshKey]);
  const scenarios = useApiData<ScenarioRow[]>(() => api.listScenarios(), [refreshKey]);
  const [assetId, setAssetId] = useState<string | null>('ast_grainger_elev2');
  const [failure, setFailure] = useState<FailureSimulation | null>(null);
  const [repair, setRepair] = useState<RepairSimulation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () =>
      (assets.data ?? []).map((a) => ({
        value: a.id,
        label: a.assetName,
        subLabel: `${a.buildingName} · failure risk ${pct(a.failureProbability)} · ${a.status}`,
      })),
    [assets.data],
  );

  const run = async (kind: 'failure' | 'repair') => {
    if (!assetId) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'failure') setFailure(await api.simulateAssetFailure(assetId));
      else setRepair(await api.simulateRepair(assetId));
      scenarios.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const showScenario = (s: ScenarioRow) => {
    if (isFailure(s.resultSummary)) {
      setFailure({ ...s.resultSummary, scenarioId: s.id, headline: s.headline ?? s.resultSummary.headline });
    } else if (isRepair(s.resultSummary)) {
      setRepair({ ...s.resultSummary, scenarioId: s.id, headline: s.headline ?? s.resultSummary.headline });
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ifx-accent)]">What if?</p>
          <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Failure Impact &amp; What-If Simulations</h1>
          <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">Quantify the cost of doing nothing and compare intervention strategies. Simulations are stored separately and never modify the real asset state.</p>
        </header>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <Panel title="Run a simulation" eyebrow="Scenario controls">
          {assets.error && <ErrorState message={assets.error} onRetry={assets.reload} />}
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Asset</span>
              <Combobox placeholder={assets.loading ? 'Loading assets…' : 'Select an asset'} options={options} value={assetId} onValueChange={setAssetId} />
            </div>
            <Button appearance="danger" leadingIcon={<FlaskConical />} loading={busy === 'failure'} disabled={!assetId || busy !== null} onClick={() => void run('failure')}>
              SIMULATE FAILURE
            </Button>
            <Button appearance="success" variant="outline" leadingIcon={<Wrench />} loading={busy === 'repair'} disabled={!assetId || busy !== null} onClick={() => void run('repair')}>
              SIMULATE REPAIR
            </Button>
            <Button
              variant="ghost"
              appearance="secondary"
              onClick={() => {
                setFailure(null);
                setRepair(null);
                refresh();
              }}
            >
              Clear
            </Button>
          </div>
          {error && <ErrorState message={error} className="mt-3" />}
        </Panel>

        {failure && <FailureSimulationCard sim={failure} onClose={() => setFailure(null)} />}
        {repair && <RepairSimulationCard sim={repair} onClose={() => setRepair(null)} />}

        {failure && repair && failure.assetId === repair.assetId && (
          <Panel title="Intervention comparison" eyebrow="Do nothing vs. repair" description="Projected campus KPIs for the two strategies on the same asset.">
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div />
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ifx-critical)]">Do nothing (asset fails)</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ifx-healthy)]">Repair now</div>
              {(
                [
                  ['Campus health', failure.after.campusHealth, repair.after.campusHealth],
                  ['Critical assets', failure.after.criticalAssets, repair.after.criticalAssets],
                  ['People at risk', failure.after.peopleAtRisk, repair.after.peopleAtRisk],
                ] as [string, number, number][]
              ).map(([label, a, b]) => (
                <React.Fragment key={label}>
                  <div className="text-left text-[var(--c3-style-basic-fg-secondary)]">{label}</div>
                  <div className="ifx-tabular text-lg font-semibold text-[var(--ifx-critical)]">{a.toLocaleString()}</div>
                  <div className="ifx-tabular text-lg font-semibold text-[var(--ifx-healthy)]">{b.toLocaleString()}</div>
                </React.Fragment>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Scenario history" eyebrow={`${scenarios.data?.length ?? 0} stored`} description="Every simulation is persisted as a SimulationScenario record.">
          {scenarios.error && <ErrorState message={scenarios.error} onRetry={scenarios.reload} />}
          {scenarios.loading && !scenarios.data && <LoadingState />}
          {scenarios.data && scenarios.data.length === 0 && <EmptyState title="No simulations yet" hint="Run a failure or repair simulation above." />}
          {scenarios.data && scenarios.data.length > 0 && (
            <ul className="flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]">
              {scenarios.data.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <StatusBadge tone={s.scenarioType === 'AssetFailure' ? 'critical' : 'healthy'} icon={false}>
                    {s.scenarioType === 'AssetFailure' ? 'Failure' : 'Repair'}
                  </StatusBadge>
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-[var(--c3-style-basic-fg-primary)] hover:underline" onClick={() => showScenario(s)}>
                    {s.headline}
                  </button>
                  {s.assetId && (
                    <Link to={`/assets/${s.assetId}`} className="text-xs text-[var(--ifx-accent)] hover:underline">
                      {s.assetName}
                    </Link>
                  )}
                  <span className="text-xs text-[var(--c3-style-basic-fg-neutral)]">{relativeTime(s.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
