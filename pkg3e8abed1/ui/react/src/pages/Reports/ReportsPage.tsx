import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, Send, Siren } from 'lucide-react';

import type { BuildingRef, ReportCluster, ReportRow, TriageResult, ZoneRef } from '@/Interfaces';
import { Alert, AlertAppearanceIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import Panel from '@/components/illinifix/Panel';
import StatusBadge from '@/components/illinifix/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/illinifix/States';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { useApiData } from '@/hooks/useApiData';
import { pct, relativeTime } from '@/lib/format';
import { reportStatusTone, severityTone } from '@/lib/status';
import { api, errorMessage, type ReportFilter } from '@/shared/api';
import { cn } from '@/lib/utils';

const FILTERS: { id: ReportFilter; label: string }[] = [
  { id: 'Open', label: 'Open' },
  { id: 'Correlated', label: 'Confirm sensor anomaly' },
  { id: 'Duplicates', label: 'In a cluster' },
  { id: 'Emergency', label: 'Emergency' },
  { id: 'Resolved', label: 'Resolved' },
  { id: 'All', label: 'All' },
];

const EXAMPLES = ['There is water coming from the ceiling in CIF.', 'The elevator in Grainger was shaking and making a grinding noise.', 'Room 2039 is really hot and the AC seems off.'];

function ReportCard({ report, onRetriage, busy }: { report: ReportRow; onRetriage: (id: string) => void; busy: boolean }) {
  return (
    <li className={cn('rounded-sm border bg-[var(--c3-style-basic-bg-primary)] p-3', report.emergencyFlag ? 'border-[var(--ifx-critical)]/60' : 'border-[var(--c3-style-basic-border-border)]')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-[var(--c3-style-basic-fg-primary)]">“{report.description}”</p>
        <span className="text-xs text-[var(--c3-style-basic-fg-neutral)]">
          {report.reporterType} · {relativeTime(report.timestamp)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {report.emergencyFlag && (
          <StatusBadge tone="critical" pulse>
            Emergency
          </StatusBadge>
        )}
        <StatusBadge tone="info" icon={false}>
          {report.category ?? 'Unclassified'}
        </StatusBadge>
        <StatusBadge tone={severityTone(report.severity)} icon={false}>
          {report.severity ?? 'n/a'}
        </StatusBadge>
        <StatusBadge tone={reportStatusTone(report.status)} icon={false}>
          {report.status}
        </StatusBadge>
        {report.duplicateGroupId && (
          <StatusBadge tone="neutral" icon={false}>
            cluster {report.duplicateGroupId.replace('inc_', '#')}
          </StatusBadge>
        )}
        {report.relatedAnomaly && (
          <StatusBadge tone="accent" icon={false}>
            confirms sensor anomaly · {pct(report.correlationConfidence)}
          </StatusBadge>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <div>
          <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Location</dt>
          <dd className="text-[var(--c3-style-basic-fg-primary)]">
            {report.buildingName ?? '—'}
            {report.zoneName ? ` · ${report.zoneName}` : ''}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Probable issue</dt>
          <dd className="text-[var(--c3-style-basic-fg-primary)]">
            {report.probableIssue ?? '—'} {report.confidence !== null ? <span className="text-[var(--c3-style-basic-fg-neutral)]">({pct(report.confidence)})</span> : null}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Likely asset</dt>
          <dd>
            {report.assetId ? (
              <Link to={`/assets/${report.assetId}`} className="text-[var(--ifx-accent)] hover:underline">
                {report.assetName}
              </Link>
            ) : (
              <span className="text-[var(--c3-style-basic-fg-secondary)]">location-based incident</span>
            )}
          </dd>
        </div>
        <div className="flex items-end justify-end">
          <Button size="sm" variant="ghost" appearance="secondary" disabled={busy} onClick={() => onRetriage(report.id)}>
            Re-run triage
          </Button>
        </div>
      </dl>
    </li>
  );
}

function TriageResultCard({ result }: { result: TriageResult }) {
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-[var(--ifx-accent)]/50 bg-[var(--c3-style-basic-bg-secondary)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ifx-accent)]">AI triage result · structured incident</p>
      {result.emergencyFlag && result.emergencyGuidance && (
        <Alert variant="solid" appearance="destructive">
          <AlertAppearanceIcon appearance="destructive" />
          <AlertContent>
            <AlertTitle>Emergency indicators detected</AlertTitle>
            <AlertDescription>{result.emergencyGuidance}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Building</dt>
          <dd className="font-semibold text-[var(--c3-style-basic-fg-primary)]">{result.building?.name ?? 'Not identified'}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Category</dt>
          <dd className="font-semibold text-[var(--c3-style-basic-fg-primary)]">
            {result.category} <span className="text-xs font-normal text-[var(--c3-style-basic-fg-secondary)]">({pct(result.confidence)} confidence)</span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Probable issue</dt>
          <dd className="font-semibold text-[var(--c3-style-basic-fg-primary)]">{result.probableIssue}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Severity</dt>
          <dd>
            <StatusBadge tone={severityTone(result.severity)} size="md">
              {result.severity}
            </StatusBadge>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Likely asset</dt>
          <dd className="font-semibold text-[var(--c3-style-basic-fg-primary)]">
            {result.likelyAsset ? (
              <Link to={`/assets/${result.likelyAsset.id}`} className="text-[var(--ifx-accent)] hover:underline">
                {result.likelyAsset.name}
              </Link>
            ) : (
              'None — location incident'
            )}
            {result.likelyAsset && <span className="ml-1 text-xs font-normal text-[var(--c3-style-basic-fg-secondary)]">failure risk {pct(result.likelyAsset.failureProbability)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Related sensor anomaly</dt>
          <dd className={cn('font-semibold', result.relatedAnomaly ? 'text-[var(--ifx-warning)]' : 'text-[var(--c3-style-basic-fg-primary)]')}>
            {result.relatedAnomaly ? 'Yes' : 'No'}
            {result.relatedAnomaly && <span className="ml-1 text-xs font-normal text-[var(--c3-style-basic-fg-secondary)]">correlation confidence {pct(result.correlationConfidence)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Related reports</dt>
          <dd className="font-semibold text-[var(--c3-style-basic-fg-primary)]">{result.relatedReportCount}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Duplicate reports</dt>
          <dd className="font-semibold text-[var(--c3-style-basic-fg-primary)]">
            {result.duplicateCount ? `${result.duplicateCount} nearby report(s) detected` : 'None detected'}
            {result.duplicateGroupId && <span className="ml-1 text-xs font-normal text-[var(--c3-style-basic-fg-secondary)]">cluster {result.duplicateGroupId.replace('inc_', '#')} · {pct(result.duplicateProbability)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Matched signals</dt>
          <dd className="text-xs text-[var(--c3-style-basic-fg-secondary)]">{result.matchedKeywords.join(', ') || '—'}</dd>
        </div>
      </dl>
      <p className="text-sm text-[var(--c3-style-basic-fg-primary)]">
        <span className="font-semibold">Recommended response:</span> {result.recommendedResponse}
      </p>
    </div>
  );
}

function ReportForm({ onSubmitted }: { onSubmitted: (r: TriageResult) => void }) {
  const [description, setDescription] = useState('');
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [reporterType, setReporterType] = useState<string>('Student');
  const [buildings, setBuildings] = useState<BuildingRef[]>([]);
  const [zones, setZones] = useState<ZoneRef[]>([]);
  const [image, setImage] = useState<{ name: string; dataUrl: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchBuildings()
      .then((b) => {
        if (!cancelled) setBuildings(b);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!buildingId) {
      setZones([]);
      return;
    }
    let cancelled = false;
    api
      .fetchZones(buildingId)
      .then((z) => {
        if (!cancelled) setZones(z);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  const onFile = (file: File | undefined) => {
    if (!file) {
      setImage(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage({ name: file.name, dataUrl: String(reader.result), size: file.size });
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const imageUrl = image && image.size <= 250000 ? image.dataUrl : null;
      const r = await api.submitReport(description, buildingId, zoneId, imageUrl, reporterType);
      setResult(r);
      onSubmitted(r);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Report a problem" eyebrow="Human sensor input" description="Describe the problem in plain English — IlliniFix determines the category, severity, likely asset and duplicates.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor="report-description" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">
              What is wrong?
            </label>
            <Textarea id="report-description" rows={4} placeholder="e.g. There is water coming from the ceiling in CIF." value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setDescription(ex)} className="rounded-xs border border-[var(--c3-style-basic-border-border)] px-2 py-0.5 text-[11px] text-[var(--c3-style-basic-fg-secondary)] hover:text-[var(--c3-style-basic-fg-primary)]">
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Building</span>
              <Combobox
                placeholder="Select or detect"
                options={buildings.map((b) => ({ value: b.id, label: b.shortName ?? b.name, subLabel: b.name }))}
                value={buildingId}
                onValueChange={(v) => {
                  setBuildingId(v);
                  setZoneId(null);
                }}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">Room / zone (optional)</span>
              <Combobox placeholder={buildingId ? 'Select zone' : 'Pick a building first'} disabled={!buildingId} options={zones.map((z) => ({ value: z.id, label: z.name, subLabel: z.floor !== null ? `Floor ${z.floor}` : undefined }))} value={zoneId} onValueChange={setZoneId} />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">You are</span>
              <Combobox options={['Student', 'Staff', 'Faculty', 'Visitor'].map((v) => ({ value: v, label: v }))} value={reporterType} onValueChange={(v) => setReporterType(v ?? 'Student')} />
            </div>
          </div>
          <div>
            <label htmlFor="report-photo" className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">
              <Camera className="size-3.5" aria-hidden /> Photo (optional)
            </label>
            <input id="report-photo" type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-xs text-[var(--c3-style-basic-fg-secondary)] file:mr-3 file:rounded-xs file:border file:border-[var(--c3-style-basic-border-border)] file:bg-[var(--c3-style-basic-bg-secondary)] file:px-2 file:py-1 file:text-xs file:text-[var(--c3-style-basic-fg-primary)]" />
            {image && (
              <div className="mt-2 flex items-center gap-3">
                <img src={image.dataUrl} alt="Preview of the attached file" className="h-20 w-28 rounded-xs border border-[var(--c3-style-basic-border-border)] object-cover" />
                <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">
                  {image.name} · {(image.size / 1024).toFixed(0)} KB. Photos are attached as context; classification is text-based in this demo.
                  {image.size > 250000 ? ' (Too large to store — preview only.)' : ''}
                </p>
              </div>
            )}
          </div>
          {error && <ErrorState message={error} />}
          <div className="flex justify-end">
            <Button type="submit" appearance="accent" leadingIcon={<Send />} loading={busy} disabled={busy || description.trim().length < 5}>
              Submit report
            </Button>
          </div>
        </form>
      </Panel>
      <div>
        {result ? (
          <TriageResultCard result={result} />
        ) : (
          <EmptyState title="Your structured incident will appear here" hint="Building · category · probable issue · severity · likely asset · duplicates · correlation with sensor anomalies" className="h-full" />
        )}
      </div>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: ReportCluster }) {
  return (
    <li className="rounded-sm border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ifx-accent)]">Incident Cluster {cluster.clusterId.replace('inc_', '#')}</p>
          <p className="text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">
            {cluster.likelyIssue} · {cluster.category}
          </p>
          <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">
            {cluster.buildingName}
            {cluster.zoneName ? ` · ${cluster.zoneName}` : ''} · first {relativeTime(cluster.firstReportedAt)} · last {relativeTime(cluster.lastReportedAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="ifx-tabular text-2xl font-semibold text-[var(--c3-style-basic-fg-primary)]">{cluster.size}</p>
          <p className="text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-neutral)]">reports · duplicate confidence {pct(cluster.confidence)}</p>
        </div>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {cluster.reports.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xs bg-[var(--c3-style-basic-bg-secondary)] px-2 py-1 text-xs">
            <span className="min-w-0 flex-1 text-[var(--c3-style-basic-fg-primary)]">“{r.description}”</span>
            <span className="text-[var(--c3-style-basic-fg-neutral)]">
              {r.reporterType} · {relativeTime(r.timestamp)}
            </span>
          </li>
        ))}
      </ul>
      {cluster.assetId && (
        <p className="mt-2 text-xs">
          Linked asset:{' '}
          <Link to={`/assets/${cluster.assetId}`} className="text-[var(--ifx-accent)] hover:underline">
            {cluster.assetName}
          </Link>
        </p>
      )}
    </li>
  );
}

/** Features 5, 6, 7 — intelligent reporting, AI triage queue and duplicate detection. */
export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const { refreshKey, refresh } = useIlliniFix();
  const tab = params.get('tab') ?? 'queue';
  const buildingParam = params.get('building');
  const [filter, setFilter] = useState<ReportFilter>('Open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const reports = useApiData<ReportRow[]>(() => api.getReports(filter), [filter, refreshKey]);
  const clusters = useApiData<ReportCluster[]>(() => api.getReportClusters(), [refreshKey]);

  const rows = useMemo(() => (reports.data ?? []).filter((r) => !buildingParam || r.buildingId === buildingParam), [reports.data, buildingParam]);
  const emergencies = useMemo(() => rows.filter((r) => r.emergencyFlag && r.status !== 'Resolved'), [rows]);

  const retriage = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await api.triageReport(id);
      reports.reload();
      clusters.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-6 py-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ifx-accent)]">Human sensors</p>
            <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Reports &amp; AI Triage</h1>
            <p className="text-xs text-[var(--c3-style-basic-fg-secondary)]">Plain-English reports become structured incidents: category, severity, likely asset, duplicates and correlation with sensor anomalies.</p>
          </div>
          <Tabs value={tab} onValueChange={(v) => setParams(buildingParam ? { tab: v, building: buildingParam } : { tab: v })} variant="boxed" size="sm">
            <TabsList>
              <TabsTrigger value="queue">Triage queue</TabsTrigger>
              <TabsTrigger value="clusters">Incident clusters</TabsTrigger>
              <TabsTrigger value="new">Report a problem</TabsTrigger>
            </TabsList>
          </Tabs>
        </header>
      </div>

      <div className="flex flex-col gap-4 p-6">
        {tab === 'new' && (
          <ReportForm
            onSubmitted={() => {
              refresh();
            }}
          />
        )}

        {tab === 'clusters' && (
          <Panel title="Duplicate report clusters" eyebrow="Feature 7" description="Reports in the same building and category within 48 h with overlapping wording or room numbers are grouped as one incident.">
            {clusters.error && <ErrorState message={clusters.error} onRetry={clusters.reload} />}
            {clusters.loading && !clusters.data && <LoadingState />}
            {clusters.data && clusters.data.length === 0 && <EmptyState title="No duplicate clusters detected" />}
            {clusters.data && clusters.data.length > 0 && (
              <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {clusters.data.map((c) => (
                  <ClusterCard key={c.clusterId} cluster={c} />
                ))}
              </ul>
            )}
          </Panel>
        )}

        {tab === 'queue' && (
          <>
            {emergencies.length > 0 && (
              <Alert variant="solid" appearance="destructive">
                <AlertAppearanceIcon appearance="destructive" />
                <AlertContent>
                  <AlertTitle>
                    <span className="inline-flex items-center gap-1">
                      <Siren className="size-4" aria-hidden /> {emergencies.length} report(s) flagged as a possible emergency
                    </span>
                  </AlertTitle>
                  <AlertDescription>
                    Follow the university emergency procedure (911 for immediate danger; configured F&amp;S emergency line) — the standard work-order flow is not sufficient for these reports.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            )}
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
              {buildingParam && (
                <button type="button" onClick={() => setParams({ tab })} className="text-xs text-[var(--ifx-accent)] underline">
                  clear building filter
                </button>
              )}
              <span className="ml-auto text-xs text-[var(--c3-style-basic-fg-secondary)]">{rows.length} report(s)</span>
            </div>
            {actionError && <ErrorState message={actionError} />}
            {reports.error && <ErrorState message={reports.error} onRetry={reports.reload} />}
            {reports.loading && !reports.data && <LoadingState label="Loading reports…" />}
            {reports.data && rows.length === 0 && <EmptyState title="No reports in this view" />}
            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <ReportCard key={r.id} report={r} onRetriage={(id) => void retriage(id)} busy={busyId === r.id} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
