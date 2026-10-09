import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { InitStatus } from '@/Interfaces';
import { api, errorMessage } from '@/shared/api';

export interface IlliniFixContextValue {
  /** Bumped after any Demo Mode / write action so every mounted page refetches. */
  refreshKey: number;
  refresh: () => void;
  agentOpen: boolean;
  setAgentOpen: (open: boolean) => void;
  demoOpen: boolean;
  setDemoOpen: (open: boolean) => void;
  /** Open the agent drawer and queue a question for it to send. */
  askAgent: (question: string) => void;
  pendingQuestion: string | null;
  consumePendingQuestion: () => void;
  initStatus: InitStatus | null;
  initError: string | null;
  initializing: boolean;
}

const IlliniFixContext = createContext<IlliniFixContextValue | null>(null);

export function IlliniFixProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [agentOpen, setAgentOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [initStatus, setInitStatus] = useState<InitStatus | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Lazy backend initialisation: on a fresh deployment this runs triage + the risk engine once.
  useEffect(() => {
    let cancelled = false;
    api
      .ensureInitialized()
      .then((status) => {
        if (cancelled) return;
        setInitStatus(status);
        setInitializing(false);
        if (status.ranRecompute) setRefreshKey((k) => k + 1);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setInitError(errorMessage(err));
        setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const askAgent = useCallback((question: string) => {
    setPendingQuestion(question);
    setAgentOpen(true);
  }, []);
  const consumePendingQuestion = useCallback(() => setPendingQuestion(null), []);

  const value = useMemo<IlliniFixContextValue>(
    () => ({
      refreshKey,
      refresh,
      agentOpen,
      setAgentOpen,
      demoOpen,
      setDemoOpen,
      askAgent,
      pendingQuestion,
      consumePendingQuestion,
      initStatus,
      initError,
      initializing,
    }),
    [refreshKey, refresh, agentOpen, demoOpen, askAgent, pendingQuestion, consumePendingQuestion, initStatus, initError, initializing],
  );

  return <IlliniFixContext.Provider value={value}>{children}</IlliniFixContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIlliniFix(): IlliniFixContextValue {
  const ctx = useContext(IlliniFixContext);
  if (!ctx) throw new Error('useIlliniFix must be used within an IlliniFixProvider');
  return ctx;
}
