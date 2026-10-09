import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDot, Eye, Info } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Tone, toneChipClass } from '@/lib/status';

interface StatusBadgeProps {
  tone: Tone;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  icon?: boolean;
  className?: string;
  pulse?: boolean;
}

const ICONS: Record<Tone, React.ComponentType<{ className?: string }>> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  monitor: Eye,
  healthy: CheckCircle2,
  info: Info,
  neutral: CircleDot,
  accent: CircleDot,
};

/**
 * Compact semantic chip (status, risk level, severity). Always pairs colour with a text label and
 * optional icon so the state is never conveyed by colour alone.
 */
export default function StatusBadge({ tone, children, size = 'sm', icon = true, className, pulse = false }: StatusBadgeProps) {
  const Icon = ICONS[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-xs border font-semibold uppercase tracking-wide',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        toneChipClass[tone],
        pulse && tone === 'critical' && 'ifx-pulse',
        className,
      )}
    >
      {icon && <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />}
      {children}
    </span>
  );
}
