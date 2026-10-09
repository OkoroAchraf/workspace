import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ClipboardList, FlaskConical, MessageSquarePlus, RotateCcw, Route, Thermometer, Wind } from 'lucide-react';

import type { DemoState } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalFooterActions, ModalHeader, ModalSubtitle, ModalTitle } from '@/components/ui/modal';
import StatusBadge from '@/components/illinifix/StatusBadge';
import { ErrorState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { pct } from '@/lib/format';
import { probabilityTone } from '@/lib/status';
import { api, errorMessage } from '@/shared/api';

interface LogEntry {
  at: string;
  text: string;
}

/**
 * Feature 35 — Demo Mode. Deterministic inputs for the presentation; the model computations stay
 * real. Every action refreshes all mounted pages through the shared refresh key.
 */
export default function DemoModePanel() {
  const { demoOpen, setDemoOpen, refresh } = useIlliniFix();
  const navigate = useNavigate();
  const [state, setState] = useState<DemoState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const loadState = useCallback(async () => {
    try {
      setState(await api.demo.getState());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (demoOpen) void loadState();
  }, [demoOpen, loadState]);

  const run = async (name: string, fn: () => Promise<string>) => {
    setBusy(name);
    setError(null);
    try {
      const text = await fn();
      setLog((prev) => [{ at: new Date().toLocaleTimeString(), text }, ...prev].slice(0, 8));
      refresh();
      await loadState();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const actions: { id: string; label: string; icon: React.ReactNode; hint: string; appearance?: 'accent' | 'secondary' | 'danger' | 'success' | 'warning'; fn: () => Promise<string> }[] = [
    {
      id: 'elev',
      label: 'Inject Elevator Degradation',
      icon: <Activity />,
      hint: 'Grainger Elevator #2: motor current, vibration and temperature trend up over 72 h.',
      fn: async () => {
        const r = await api.demo.injectElevatorDegradation();
        return `Elevator degradation injected → failure probability ${pct(r.prediction.failureProbability)} (${r.prediction.riskLevel}), ${r.prediction.predictedFailureMode}.`;
      },
    },
    {
      id: 'hvac',
      label: 'Inject HVAC Failure',
      icon: <Wind />,
      hint: 'CIF HVAC #7: supply temperature and fan current rise while airflow declines.',
      fn: async () => {
        const r = await api.demo.injectHvacFailure();
        return `HVAC degradation injected → failure probability ${pct(r.prediction.failureProbability)} (${r.prediction.riskLevel}), ${r.prediction.predictedFailureMode}.`;
      },
    },
    {
      id: 'report',
      label: 'Submit Student Report',
      icon: <MessageSquarePlus />,
      hint: '“The elevator in Grainger was shaking and making a grinding noise.” → AI triage + correlation.',
      fn: async () => {
        const r = await api.demo.submitDemoReport();
        return `Report triaged: ${r.category} / ${r.severity}, likely asset ${r.likelyAsset?.name ?? 'none'}, correlation confidence ${pct(r.correlationConfidence)}.`;
      },
    },
    {
      id: 'sim',
      label: 'Simulate Elevator Failure',
      icon: <FlaskConical />,
      hint: 'Blast radius of Grainger Elevator #2 going offline (does not change the real asset).',
      appearance: 'danger',
      fn: async () => {
        const r = await api.simulateAssetFailure('ast_grainger_elev2');
        navigate('/assets/ast_grainger_elev2');
        return `${r.headline}; campus health ${r.before.campusHealth} → ${r.after.campusHealth}.`;
      },
    },
    {
      id: 'plan',
      label: 'Optimize Maintenance Crews',
      icon: <Route />,
      hint: 'Run the greedy optimizer for all available crews on an 8-hour shift.',
      appearance: 'success',
      fn: async () => {
        const p = await api.optimizePlan([], 8);
        navigate('/crews');
        return `Plan generated: ${p.scheduledCount}/${p.workOrderCount} work orders scheduled across ${p.crewCount} crews; campus health ${p.currentCampusHealth} → ${p.projectedCampusHealth}.`;
      },
    },
    {
      id: 'wo',
      label: 'Create Elevator Work Order',
      icon: <ClipboardList />,
      hint: 'Draft a predictive work order for Grainger Elevator #2 from its recommendation.',
      appearance: 'secondary',
      fn: async () => {
        const wo = await api.createDraftWorkOrder('ast_grainger_elev2');
        return `Draft work order ${wo.id} created (${wo.priority}, ${wo.requiredSkill}).`;
      },
    },
    {
      id: 'reset',
      label: 'Reset Demo',
      icon: <RotateCcw />,
      hint: 'Clean telemetry for the two demo assets; remove demo reports, work orders, scenarios and plans.',
      appearance: 'warning',
      fn: async () => {
        const s = await api.demo.resetDemo();
        return s.message ?? 'Demo reset.';
      },
    },
    {
      id: 'clock',
      label: 'Refresh Demo Clock',
      icon: <Thermometer />,
      hint: 'Regenerate all 7-day telemetry ending now, with every scripted scenario (takes ~1 minute).',
      appearance: 'secondary',
      fn: async () => {
        const r = await api.demo.seedTelemetry();
        return `Telemetry regenerated: ${r.readingsWritten.toLocaleString()} readings for ${r.assets} assets, ending ${r.telemetryEndsAt}.`;
      },
    },
  ];

  return (
    <Modal open={demoOpen} onOpenChange={setDemoOpen}>
      <ModalContent contentWidth="contained" footerMode="default">
        <ModalHeader>
          <ModalTitle>Demo Mode</ModalTitle>
          <ModalSubtitle>Deterministic inputs for the presentation — the anomaly, risk, triage and optimization computations remain real.</ModalSubtitle>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4">
            {state && (
              <div className="flex flex-wrap items-center gap-2 rounded-sm bg-[var(--c3-style-basic-bg-secondary)] p-3 text-xs text-[var(--c3-style-basic-fg-secondary)]">
                <span className="font-semibold uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">State</span>
                <StatusBadge tone={state.elevatorPrediction ? probabilityTone(state.elevatorPrediction.failureProbability) : 'neutral'} icon={false}>
                  Elevator #2 {state.elevatorPrediction ? pct(state.elevatorPrediction.failureProbability) : '—'}
                </StatusBadge>
                <StatusBadge tone={state.hvacPrediction ? probabilityTone(state.hvacPrediction.failureProbability) : 'neutral'} icon={false}>
                  CIF HVAC #7 {state.hvacPrediction ? pct(state.hvacPrediction.failureProbability) : '—'}
                </StatusBadge>
                <span>
                  {state.demoReports} demo report(s) · {state.demoWorkOrders} demo work order(s) · {state.scenarios} scenario(s) · plan {state.planExists ? 'exists' : 'none'}
                </span>
                <span className="ml-auto">telemetry ends {state.telemetryEndsAt ? new Date(state.telemetryEndsAt).toLocaleString() : '—'}</span>
              </div>
            )}
            {error && <ErrorState message={error} />}
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {actions.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 rounded-sm border border-[var(--c3-style-basic-border-border)] p-3">
                  <Button variant={a.id === 'elev' || a.id === 'hvac' || a.id === 'report' ? 'solid' : 'outline'} appearance={a.appearance ?? 'accent'} leadingIcon={a.icon} loading={busy === a.id} disabled={busy !== null} onClick={() => void run(a.id, a.fn)}>
                    {a.label}
                  </Button>
                  <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">{a.hint}</p>
                </li>
              ))}
            </ul>
            {log.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">Activity</p>
                <ul className="mt-1 flex flex-col gap-1 text-xs">
                  {log.map((l) => (
                    <li key={`${l.at}-${l.text}`} className="rounded-xs bg-[var(--c3-style-basic-bg-secondary)] px-2 py-1 text-[var(--c3-style-basic-fg-primary)]">
                      <span className="ifx-tabular text-[var(--c3-style-basic-fg-neutral)]">{l.at}</span> {l.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalFooterActions>
            <Button variant="ghost" appearance="secondary" onClick={() => setDemoOpen(false)}>
              Close
            </Button>
          </ModalFooterActions>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
