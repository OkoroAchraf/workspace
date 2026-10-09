import React from 'react';
import { FlaskConical, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';

/** Right-aligned top-bar controls: live indicator, Demo Mode and the Operations Agent toggle. */
export default function TopNavActions() {
  const { agentOpen, setAgentOpen, setDemoOpen, initializing } = useIlliniFix();
  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)] md:inline-flex">
        <span className={initializing ? 'inline-block size-2 rounded-full bg-[var(--ifx-monitor)]' : 'ifx-pulse-live inline-block size-2 rounded-full bg-[var(--ifx-healthy)]'} aria-hidden />
        {initializing ? 'Initializing models' : 'Live · simulated telemetry'}
      </span>
      <Button size="sm" variant="outline" appearance="secondary" leadingIcon={<FlaskConical />} onClick={() => setDemoOpen(true)}>
        Demo Mode
      </Button>
      <Button size="sm" variant={agentOpen ? 'soft' : 'solid'} appearance="accent" leadingIcon={<Sparkles />} onClick={() => setAgentOpen(!agentOpen)}>
        Ask IlliniFix
      </Button>
    </div>
  );
}
