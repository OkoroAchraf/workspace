import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 py-6 text-sm text-[var(--c3-style-basic-fg-secondary)]', className)} role="status">
      <Spinner size="md" label={label} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-sm border border-[var(--ifx-critical)]/40 bg-[var(--ifx-critical-soft)] p-3 text-sm text-[var(--c3-style-basic-fg-primary)]',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--ifx-critical)]" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">Backend request failed</p>
          <p className="break-words text-xs text-[var(--c3-style-basic-fg-secondary)]">{message}</p>
        </div>
      </div>
      {onRetry && (
        <div>
          <Button size="sm" variant="outline" appearance="secondary" leadingIcon={<RefreshCw />} onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, className }: { title: string; hint?: string; className?: string }) {
  return (
    <div className={cn('rounded-sm border border-dashed border-[var(--c3-style-basic-border-border)] p-6 text-center', className)}>
      <p className="text-sm font-medium text-[var(--c3-style-basic-fg-primary)]">{title}</p>
      {hint && <p className="mt-1 text-xs text-[var(--c3-style-basic-fg-secondary)]">{hint}</p>}
    </div>
  );
}

export function DemoDataTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs border border-[var(--c3-style-basic-border-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]',
        className,
      )}
    >
      Simulated demo data
    </span>
  );
}
