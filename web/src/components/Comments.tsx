import { useRef, useState, type KeyboardEvent } from 'react'
import type { Comment } from '../../../functions/src/model.ts'
import { addComment, deleteComment, editComment, type Actor } from '../data/actions.ts'

type CommentWithId = Comment & { id: string }

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

// createdAt is null while a just-written serverTimestamp() is still pending.
export function relativeTime(ts: { toMillis(): number } | null | undefined, now = Date.now()): string {
  if (!ts) return 'just now'
  const sec = Math.round((ts.toMillis() - now) / 1000)
  const abs = Math.abs(sec)
  if (abs < 45) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), 'day')
  if (abs < 86400 * 365) return rtf.format(Math.round(sec / (86400 * 30)), 'month')
  return rtf.format(Math.round(sec / (86400 * 365)), 'year')
}

export function sortComments(list: CommentWithId[]): CommentWithId[] {
  const key = (c: CommentWithId) => (c.createdAt ? c.createdAt.toMillis() : Infinity)
  return [...list].sort((a, b) => {
    const ka = key(a), kb = key(b)
    return ka === kb ? 0 : ka < kb ? -1 : 1
  })
}

const submitOnModEnter = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    fn()
  }
}

function CommentItem({ c, me }: { c: CommentWithId; me: Actor }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.text)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mine = c.uid === me.uid

  const inFlight = useRef(false)

  const run = async (what: string, fn: () => Promise<void>, done: () => void) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await fn()
      done()
    } catch (e) {
      setError(`Couldn't ${what}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const save = () => {
    const text = draft.trim()
    if (!text || text.length > 5000) return
    void run('save your edit', () => editComment(c.id, text), () => setEditing(false))
  }

  return (
    <li className="comment">
      <div className="comment-head">
        <b>{c.name}</b> <span className="muted">{relativeTime(c.createdAt)}</span>
        {c.editedAt && <span className="muted"> (edited)</span>}
      </div>
      {editing ? (
        <div>
          <textarea value={draft} rows={3} maxLength={5000} disabled={busy} autoFocus
            onChange={(e) => setDraft(e.target.value)} onKeyDown={submitOnModEnter(save)} />
          <div className="comment-actions">
            <button disabled={busy || !draft.trim()} onClick={save}>Save</button>
            <button disabled={busy} onClick={() => { setEditing(false); setDraft(c.text); setError(null) }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="prose">{c.text}</p>
      )}
      {mine && !editing && (
        <div className="comment-actions">
          {confirming ? (
            <>
              <span>Delete?</span>
              <button disabled={busy} onClick={() => run('delete the comment', () => deleteComment(c.id), () => setConfirming(false))}>Yes</button>
              <button disabled={busy} onClick={() => setConfirming(false)}>No</button>
            </>
          ) : (
            <>
              <button className="link-btn" disabled={busy} onClick={() => { setDraft(c.text); setEditing(true) }}>Edit</button>
              <button className="link-btn" disabled={busy} onClick={() => setConfirming(true)}>Delete</button>
            </>
          )}
        </div>
      )}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </li>
  )
}

export default function Comments({ submissionId, comments, me }: { submissionId: string; comments: CommentWithId[]; me: Actor }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const add = async () => {
    const t = text.trim()
    if (!t || t.length > 5000 || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await addComment(submissionId, t, me)
      setText('')
    } catch (e) {
      setError(`Couldn't add your comment: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const sorted = sortComments(comments)
  return (
    <div className="comments">
      <div className="lbl">Comments ({sorted.length})</div>
      {sorted.length > 0 && (
        <ul className="comment-list">
          {sorted.map((c) => <CommentItem key={c.id} c={c} me={me} />)}
        </ul>
      )}
      <textarea value={text} rows={3} maxLength={5000} placeholder="Add a comment (Ctrl/Cmd+Enter to post)"
        disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={submitOnModEnter(add)} />
      <div className="comment-actions">
        <button disabled={busy || !text.trim()} onClick={add}>Add</button>
        {error && <span className="inline-error" role="alert">{error}</span>}
      </div>
    </div>
  )
}
