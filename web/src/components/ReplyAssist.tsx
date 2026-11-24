import type { ThreadDoc } from '../../../functions/src/model.ts'
import { currentFor, isSettled } from '../../../functions/src/shared/replyAi.ts'
import { settleReply, unsettleReply, type Actor } from '../data/actions.ts'
import { draftReply } from '../data/mailActions.ts'
import { aiNote, speakerWroteLast } from '../lib/emails.ts'

// The AI reply assistant's pieces of the conversation sheet. The components here hold no state of their own: the
// sheet keeps busy and error state, so each piece can be rendered (and clicked) in tests without a browser.

type Thread = ThreadDoc & { id: string }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface AiLineProps {
  thread: Thread
  /** Null for members: they see the reading but no buttons. */
  me: Actor | null
  busy: boolean
  error: string | null
  onBusy: (busy: boolean) => void
  onError: (error: string | null) => void
}

/** What the AI made of the newest reply, with No reply needed / Undo for admins. */
export function AiLine({ thread, me, busy, error, onBusy, onError }: AiLineProps) {
  const note = aiNote(thread)
  const settled = currentFor(thread, thread.settled)
  const byPerson = settled && settled.by !== 'ai' ? `Marked no reply needed · ${settled.byName}` : null
  const canSettle = me !== null && !!thread.lastReplyId && speakerWroteLast(thread)
  const canUndo = me !== null && isSettled(thread)
  if (!note && !byPerson && !canSettle && !canUndo) return null

  const run = async (act: () => Promise<void>) => {
    onBusy(true)
    onError(null)
    try {
      await act()
    } catch (e) {
      onError(`Couldn't update: ${errorText(e)}`)
    } finally {
      onBusy(false)
    }
  }
  const text = [note?.text, byPerson].filter(Boolean).join(' · ')
  return (
    <div className="ai-line">
      {text && <span className={note?.tone === 'warn' ? 'warn-line' : 'ai-note'}>{text}</span>}
      {canSettle && me && (
        <button type="button" className="btn text sm" disabled={busy}
          onClick={() => void run(() => settleReply(thread.id, thread.lastReplyId!, me))}>No reply needed</button>
      )}
      {canUndo && <button type="button" className="btn text sm" disabled={busy} onClick={() => void run(() => unsettleReply(thread.id))}>Undo</button>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  )
}

interface DraftButtonProps {
  threadId: string
  hasDraft: boolean
  /** The server is drafting, or our call is in flight. */
  drafting: boolean
  onBusy: (busy: boolean) => void
  onError: (error: string | null) => void
}

export function DraftButton({ threadId, hasDraft, drafting, onBusy, onError }: DraftButtonProps) {
  const go = async () => {
    onBusy(true)
    onError(null)
    try {
      await draftReply({ threadId })
    } catch (e) {
      onError(`Couldn't draft a reply: ${errorText(e)}`)
    } finally {
      onBusy(false)
    }
  }
  return (
    <button type="button" className="btn sm" disabled={drafting} onClick={() => void go()}>
      {drafting ? 'Drafting…' : hasDraft ? 'Redraft' : 'Draft a reply'}
    </button>
  )
}

/** Asked in place of sending when the reply still holds a [fill-in]. */
export function GapConfirm({ gap, onSend, onKeep }: { gap: string; onSend: () => void; onKeep: () => void }) {
  return (
    <div className="gap-confirm" role="alert">
      <p>{`This reply still has gaps like ${gap}. Send anyway?`}</p>
      <div className="actions">
        <button type="button" className="btn text sm" onClick={onKeep}>Keep editing</button>
        <button type="button" className="btn primary sm" onClick={onSend}>Send anyway</button>
      </div>
    </div>
  )
}

/** Members see the draft but can't send it. */
export function SuggestedReply({ text }: { text: string }) {
  return (
    <div className="suggested">
      <span className="hint">Suggested reply</span>
      <p>{text}</p>
    </div>
  )
}
