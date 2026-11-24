// Shared with the web app. Server-safe and browser-safe: no Node or firebase-admin imports; type-only imports from ../model.js.

import type { ReplyLabel, ThreadDoc } from '../model.js'

export const AUTO_CLEAR = 0.95
export const WITHDRAW_BLOCK = 0.10
export const WITHDRAW_WARN = 0.30
export const REPLY_LABELS: ReplyLabel[] = ['needs_answer', 'no_answer_needed', 'withdrawing', 'unclear']

type Probs = Record<ReplyLabel, number>

/** Highest-probability label; ties break in REPLY_LABELS order. */
export function topLabel(p: Probs): ReplyLabel {
  let best = REPLY_LABELS[0]
  for (const l of REPLY_LABELS) if (p[l] > p[best]) best = l
  return best
}

export const autoClears = (p: Probs): boolean => p.no_answer_needed >= AUTO_CLEAR && p.withdrawing < WITHDRAW_BLOCK
export const mayWithdraw = (p: Probs): boolean => p.withdrawing >= WITHDRAW_WARN
export function wantsDraft(p: Probs): boolean {
  const t = topLabel(p)
  return (t === 'needs_answer' || t === 'unclear') && !autoClears(p)
}

/** Returns v only when it belongs to the thread's newest reply. */
export function currentFor<T extends { messageId: string }>(
  thread: Pick<ThreadDoc, 'lastReplyId'> | undefined, v: T | null | undefined,
): T | null {
  if (!thread || !thread.lastReplyId || !v) return null
  return v.messageId === thread.lastReplyId ? v : null
}

export const isSettled = (thread: ThreadDoc | undefined): boolean => !!thread && currentFor(thread, thread.settled) !== null
export const clearedByAi = (thread: ThreadDoc | undefined): boolean => currentFor(thread, thread?.settled)?.by === 'ai'
