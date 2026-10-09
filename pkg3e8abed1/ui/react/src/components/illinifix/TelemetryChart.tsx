import React, { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';

import type { SensorSeries, TelemetryPoint } from '@/Interfaces';
import { hourLabel, num, shortDateTime, signed } from '@/lib/format';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/illinifix/StatusBadge';

interface TelemetryChartProps {
  series: SensorSeries;
  color?: string;
  height?: number;
  compact?: boolean;
  className?: string;
}

interface ChartPoint extends TelemetryPoint {
  anomalyValue: number | null;
}

function TelemetryTooltip({ active, payload, unit }: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload as ChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-sm border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)] px-2.5 py-2 text-xs shadow-lg">
      <p className="text-[var(--c3-style-basic-fg-secondary)]">{shortDateTime(point.t)}</p>
      <p className="ifx-tabular text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">
        {num(point.v, 2)} {unit}
      </p>
      <p className={cn('ifx-tabular', point.anomaly ? 'text-[var(--ifx-critical)]' : 'text-[var(--c3-style-basic-fg-secondary)]')}>
        z-score {signed(point.z, 2)} {point.anomaly ? '· anomaly' : ''}
      </p>
    </div>
  );
}

/**
 * Seven-day hourly telemetry for one sensor. Shows the normal band (baseline ± 3σ), the baseline
 * mean, the measured series (2px line) and marks anomalous readings; the detected anomaly window
 * is shaded so the degradation region is unmistakable.
 */
export default function TelemetryChart({ series, color = 'var(--ifx-series-1)', height = 180, compact = false, className }: TelemetryChartProps) {
  const data = useMemo<ChartPoint[]>(
    () => series.readings.map((p) => ({ ...p, anomalyValue: p.anomaly ? p.v : null })),
    [series.readings],
  );
  const anomalies = useMemo(() => data.filter((p) => p.anomaly), [data]);
  const lastT = data.length ? data[data.length - 1].t : undefined;
  const degraded = Math.abs(series.deviationPct) >= 5 || series.anomalyCount24h >= 6;
  const yDomain = useMemo<[number, number]>(() => {
    const values = data.map((p) => p.v);
    const lo = Math.min(...values, series.normalMin ?? Infinity);
    const hi = Math.max(...values, series.normalMax ?? -Infinity);
    const pad = (hi - lo) * 0.08 || 1;
    return [lo - pad, hi + pad];
  }, [data, series.normalMin, series.normalMax]);

  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <span className="text-sm font-semibold text-[var(--c3-style-basic-fg-primary)]">{series.name}</span>
          <span className="text-xs text-[var(--c3-style-basic-fg-neutral)]">({series.unit})</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="ifx-tabular text-[var(--c3-style-basic-fg-secondary)]">
            24h mean {num(series.mean24h, 1)} vs baseline {num(series.baselineMean, 1)}
          </span>
          <StatusBadge tone={degraded ? (series.anomalyCount24h >= 12 ? 'critical' : 'warning') : 'healthy'} icon={false}>
            {signed(series.deviationPct, 1, '%')}
          </StatusBadge>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: compact ? -16 : 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--ifx-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={hourLabel}
            minTickGap={56}
            tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis domain={yDomain} tick={{ fill: 'var(--ifx-neutral)', fontSize: 11 }} width={48} axisLine={false} tickLine={false} tickFormatter={(v: number) => num(v, 1)} />
          {series.normalMin !== null && series.normalMax !== null && (
            <ReferenceArea y1={series.normalMin} y2={series.normalMax} fill="var(--ifx-healthy)" fillOpacity={0.07} ifOverflow="hidden" />
          )}
          {series.anomalyStartAt && lastT && (
            <ReferenceArea
              x1={series.anomalyStartAt}
              x2={lastT}
              fill="var(--ifx-critical)"
              fillOpacity={0.12}
              ifOverflow="hidden"
              label={{ value: 'anomaly window', position: 'insideTopLeft', fill: 'var(--ifx-critical)', fontSize: 11 }}
            />
          )}
          <ReferenceLine y={series.baselineMean} stroke="var(--ifx-baseline)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} name={series.name} />
          <Scatter data={anomalies} dataKey="anomalyValue" fill="var(--ifx-critical)" isAnimationActive={false} name="Anomaly" />
          <Tooltip content={<TelemetryTooltip unit={series.unit} />} cursor={{ stroke: 'var(--ifx-baseline)' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
