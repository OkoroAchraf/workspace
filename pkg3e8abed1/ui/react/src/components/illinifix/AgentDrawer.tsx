import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, SendHorizontal, Sparkles, X } from 'lucide-react';

import type { AgentAction, AgentAnswer, ChatTurn } from '@/Interfaces';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useIlliniFix } from '@/contexts/IlliniFixProvider';
import { api, errorMessage } from '@/shared/api';
import { pct, num } from '@/lib/format';
import { cn } from '@/lib/utils';

const STARTERS = [
  'What should we repair first today?',
  'Why is Grainger Elevator #2 considered critical?',
  'Are any student reports confirming existing sensor anomalies?',
  'We only have three crews available today. What should we fix?',
  'What happens if Grainger Elevator #2 fails?',
  'Which issues have the biggest accessibility impact?',
  'Show me high-risk assets without an active work order.',
  'Which building currently has the worst infrastructure health?',
];

function Citations({ answer }: { answer: AgentAnswer }) {
  if (!answer.citations.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {answer.citations.map((c) => (
        <span key={`${c.label}-${c.value}`} className="inline-flex items-center gap-1 rounded-xs border border-[var(--c3-style-basic-border-border)] px-1.5 py-0.5 text-[10px] text-[var(--c3-style-basic-fg-secondary)]">
          <span className="uppercase tracking-wide">{c.label}</span>
          <span className="font-semibold text-[var(--c3-style-basic-fg-primary)]">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * ASK ILLINIFIX — the Operations Agent copilot drawer. Every answer is produced by
 * `IlliniFixAgent.ask`, which routes the question to data tools and grounds the reply in the
 * returned facts; the drawer shows the citations and lets the operator trigger the suggested
 * actions (open asset, simulate failure, create draft work order, open the crew planner).
 */
export default function AgentDrawer() {
  const { setAgentOpen, pendingQuestion, consumePendingQuestion, refresh } = useIlliniFix();
  const navigate = useNavigate();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const turnsRef = useRef<ChatTurn[]>([]);
  turnsRef.current = turns;

  const send = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q) return;
    const history = turnsRef.current.filter((t) => !t.pending && !t.error);
    setTurns((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '', pending: true }]);
    setInput('');
    setBusy(true);
    try {
      const answer = await api.ask(q, history);
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { role: 'assistant', content: answer.answer, answer } : t)));
    } catch (err) {
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { role: 'assistant', content: '', error: errorMessage(err) } : t)));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (pendingQuestion) {
      const q = pendingQuestion;
      consumePendingQuestion();
      void send(q);
    }
  }, [pendingQuestion, consumePendingQuestion, send]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const runAction = useCallback(
    async (action: AgentAction) => {
      try {
        switch (action.action) {
          case 'openAsset':
            if (action.assetId) navigate(`/assets/${action.assetId}`);
            break;
          case 'openPlanner':
            navigate('/crews');
            break;
          case 'ask':
            if (action.question) await send(action.question);
            break;
          case 'simulateFailure': {
            if (!action.assetId) return;
            setBusy(true);
            const sim = await api.simulateAssetFailure(action.assetId);
            const text =
              `**Simulated failure (not real):** ${sim.headline}\n\n` +
              `- Estimated daily users affected: **${num(sim.impacts.peopleAffected)}**\n` +
              `- Accessibility impact: **${sim.impacts.impactLevel}**\n` +
              (sim.impacts.alternativeUtilizationIncreasePct !== null
                ? `- Load on ${sim.impacts.alternativesCount} alternative asset(s): **+${sim.impacts.alternativeUtilizationIncreasePct}%**\n`
                : '- No alternative asset — full loss of service\n') +
              `- Impacted floors: ${sim.impacts.impactedFloors ?? 'n/a'}\n` +
              `- Campus health ${sim.before.campusHealth} → **${sim.after.campusHealth}**, critical assets ${sim.before.criticalAssets} → **${sim.after.criticalAssets}**`;
            setTurns((prev) => [...prev, { role: 'assistant', content: text }]);
            refresh();
            break;
          }
          case 'createWorkOrder': {
            if (!action.assetId) return;
            setBusy(true);
            const wo = await api.createDraftWorkOrder(action.assetId);
            setTurns((prev) => [
              ...prev,
              { role: 'assistant', content: `Draft work order **${wo.id}** created: *${wo.title}* — priority ${wo.priority}, ${wo.requiredSkill} crew, ~${wo.estimatedDuration ?? 60} min. (IlliniFix record only — not the university work-order system.)` },
            ]);
            refresh();
            break;
          }
          default:
            break;
        }
      } catch (err) {
        setTurns((prev) => [...prev, { role: 'assistant', content: '', error: errorMessage(err) }]);
      } finally {
        setBusy(false);
      }
    },
    [navigate, refresh, send],
  );

  return (
    <aside className="flex w-[420px] max-w-[90vw] shrink-0 flex-col border-l border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-primary)]" aria-label="IlliniFix Operations Agent">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--c3-style-basic-border-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-sm bg-[var(--ifx-accent-soft)] text-[var(--ifx-accent)]">
            <Bot className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--c3-style-basic-fg-primary)]">Ask IlliniFix</p>
            <p className="text-[11px] text-[var(--c3-style-basic-fg-neutral)]">Operations Agent · grounded in live application data</p>
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" appearance="secondary" aria-label="Close agent" onClick={() => setAgentOpen(false)}>
          <X />
        </Button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--c3-style-basic-fg-secondary)]">
              I answer from IlliniFix data — asset health, failure predictions, human reports, work orders and crews — and I cite the numbers I
              use. Predictions are model estimates on simulated demo data.
            </p>
            <div className="flex flex-col gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-xs border border-[var(--c3-style-basic-border-border)] px-3 py-2 text-left text-xs text-[var(--c3-style-basic-fg-primary)] transition-colors hover:border-[var(--ifx-accent)] hover:bg-[var(--ifx-accent-soft)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={`${i}-${t.role}`} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[92%] rounded-sm px-3 py-2 text-sm',
                t.role === 'user'
                  ? 'bg-[var(--ifx-accent)] text-white'
                  : 'border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-secondary)] text-[var(--c3-style-basic-fg-primary)]',
              )}
            >
              {t.pending && (
                <span className="inline-flex items-center gap-2 text-[var(--c3-style-basic-fg-secondary)]">
                  <Spinner size="sm" /> Querying application data…
                </span>
              )}
              {t.error && <span className="text-[var(--ifx-critical)]">Agent request failed: {t.error}</span>}
              {!t.pending && !t.error && (
                <div className="ifx-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown>
                </div>
              )}
              {t.answer && (
                <>
                  <Citations answer={t.answer} />
                  {t.answer.suggestedActions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.answer.suggestedActions.map((a) => (
                        <Button key={`${a.action}-${a.assetId ?? ''}-${a.label}`} size="sm" variant="outline" appearance="secondary" disabled={busy} onClick={() => void runAction(a)}>
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--c3-style-basic-fg-neutral)]">
                    {t.answer.usedLlm ? 'Phrased by the platform LLM from retrieved facts' : 'Deterministic answer from retrieved facts'} · intent {t.answer.intent}
                  </p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex items-center gap-2 border-t border-[var(--c3-style-basic-border-border)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="agent-question" className="sr-only">
          Ask the IlliniFix Operations Agent
        </label>
        <input
          id="agent-question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about risk, reports, crews…"
          disabled={busy}
          className="min-w-0 flex-1 rounded-xs border border-[var(--c3-style-basic-border-border)] bg-[var(--c3-style-basic-bg-page)] px-3 py-2 text-sm text-[var(--c3-style-basic-fg-primary)] placeholder:text-[var(--c3-style-basic-fg-neutral)] focus:border-[var(--ifx-accent)] focus:outline-none"
        />
        <Button type="submit" size="icon-md" appearance="accent" aria-label="Send" disabled={busy || !input.trim()} loading={busy}>
          {busy ? <Sparkles /> : <SendHorizontal />}
        </Button>
      </form>
      <p className="px-3 pb-2 text-[10px] text-[var(--c3-style-basic-fg-neutral)]">
        Simulated hackathon data · failure probabilities are predictions, e.g. {pct(0.89)} means high likelihood, not a confirmed failure.
      </p>
    </aside>
  );
}
