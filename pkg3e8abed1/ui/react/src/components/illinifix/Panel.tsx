import React from 'react';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface PanelProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  eyebrow?: React.ReactNode;
}

/** Section surface used throughout IlliniFix: title band + optional actions + body. */
export default function Panel({ title, description, actions, children, className, contentClassName, size = 'md', eyebrow }: PanelProps) {
  return (
    <Card size={size} className={cn('min-w-0 rounded-sm bg-[var(--c3-style-basic-bg-primary)]', className)}>
      <CardHeader>
        <CardTitle className="flex flex-col gap-0.5">
          {eyebrow && <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ifx-accent)]">{eyebrow}</span>}
          <span className="text-sm font-semibold uppercase tracking-wide text-[var(--c3-style-basic-fg-primary)]">{title}</span>
        </CardTitle>
        {description && <CardDescription className="text-xs text-[var(--c3-style-basic-fg-secondary)]">{description}</CardDescription>}
        {actions && <CardAction>{actions}</CardAction>}
      </CardHeader>
      <CardContent className={cn('min-w-0', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
