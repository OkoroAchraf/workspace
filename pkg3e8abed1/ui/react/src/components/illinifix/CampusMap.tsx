import React, { useMemo } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import type { BuildingSummary } from '@/Interfaces';
import { score } from '@/lib/format';
import { statusTone, toneColor } from '@/lib/status';
import { cn } from '@/lib/utils';

interface CampusMapProps {
  buildings: BuildingSummary[];
  selectedId?: string | null;
  onSelect?: (building: BuildingSummary) => void;
  className?: string;
  interactive?: boolean;
  /** Buildings to visually mute (e.g. filtered out). */
  dimmedIds?: string[];
  /** Optional override colour per building id (used by failure simulation). */
  colorOverrides?: Record<string, string>;
}

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

/**
 * Interactive campus map (Leaflet). Each building is a marker coloured by its health status
 * (red Critical, orange Warning, yellow Monitor, green Healthy); size grows with daily occupancy.
 */
export default function CampusMap({ buildings, selectedId, onSelect, className, interactive = true, dimmedIds, colorOverrides }: CampusMapProps) {
  const located = useMemo(() => buildings.filter((b) => b.latitude !== null && b.longitude !== null), [buildings]);
  const center = useMemo<[number, number]>(() => {
    if (!located.length) return [40.109, -88.228];
    const lat = located.reduce((s, b) => s + (b.latitude as number), 0) / located.length;
    const lon = located.reduce((s, b) => s + (b.longitude as number), 0) / located.length;
    return [lat, lon];
  }, [located]);
  const maxOcc = useMemo(() => Math.max(1, ...located.map((b) => b.estimatedDailyOccupancy || 0)), [located]);

  return (
    <div className={cn('ifx-map relative min-h-[260px] w-full overflow-hidden rounded-sm border border-[var(--c3-style-basic-border-border)]', className)}>
      <MapContainer
        center={center}
        zoom={15}
        minZoom={13}
        maxZoom={18}
        scrollWheelZoom={interactive}
        dragging={interactive}
        zoomControl={interactive}
        doubleClickZoom={interactive}
        className="h-full w-full"
      >
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} subdomains="abcd" />
        {located.map((b) => {
          const tone = statusTone(b.healthStatus);
          const color = colorOverrides?.[b.id] ?? toneColor(tone);
          const selected = selectedId === b.id;
          const dimmed = dimmedIds?.includes(b.id) ?? false;
          const radius = 10 + Math.round(((b.estimatedDailyOccupancy || 0) / maxOcc) * 12);
          return (
            <React.Fragment key={b.id}>
              {b.healthStatus === 'Critical' && !dimmed && (
                <CircleMarker
                  center={[b.latitude as number, b.longitude as number]}
                  radius={radius + 10}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 1, opacity: 0.5 }}
                  interactive={false}
                />
              )}
              <CircleMarker
                center={[b.latitude as number, b.longitude as number]}
                radius={selected ? radius + 3 : radius}
                pathOptions={{
                  color: selected ? 'var(--c3-style-basic-fg-primary)' : color,
                  fillColor: color,
                  fillOpacity: dimmed ? 0.15 : 0.65,
                  opacity: dimmed ? 0.3 : 1,
                  weight: selected ? 3 : 2,
                }}
                eventHandlers={onSelect ? { click: () => onSelect(b) } : undefined}
              >
                <LeafletTooltip direction="top" offset={[0, -radius]} opacity={1}>
                  <div className="min-w-[160px] text-xs">
                    <p className="font-semibold">{b.name}</p>
                    <p>
                      Health {score(b.overallHealthScore)} · {b.healthStatus}
                    </p>
                    <p>
                      {b.criticalAssetCount} critical · {b.highRiskAssetCount} high-risk · {b.activeIncidentCount} reports
                    </p>
                  </div>
                </LeafletTooltip>
              </CircleMarker>
            </React.Fragment>
          );
        })}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] flex flex-wrap gap-2 rounded-xs bg-[var(--c3-style-basic-bg-primary)]/85 px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--c3-style-basic-fg-secondary)]">
        {(['Critical', 'Warning', 'Monitor', 'Healthy'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: toneColor(statusTone(s)) }} aria-hidden />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
