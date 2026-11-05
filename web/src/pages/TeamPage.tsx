import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import type { Role, UserDoc } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { setRole } from '../data/actions.ts'
import { db } from '../firebase.ts'
import { teamGroups, type TeamUser } from '../lib/team.ts'

const fmtDate = (u: UserDoc) =>
  u.createdAt
    ? new Date(u.createdAt.toMillis()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'just now'

interface Act { label: string; to: Role; confirm?: boolean }

const ACTIONS: Record<Role, Act[]> = {
  waiting: [{ label: 'Approve', to: 'member' }, { label: 'Reject', to: 'removed', confirm: true }],
  member: [{ label: 'Make admin', to: 'admin' }, { label: 'Remove', to: 'removed', confirm: true }],
  admin: [{ label: 'Make member', to: 'member' }, { label: 'Remove', to: 'removed', confirm: true }],
  removed: [{ label: 'Restore', to: 'member' }],
}

function Row({ u, isMe }: { u: TeamUser; isMe: boolean }) {
  const [confirming, setConfirming] = useState<Act | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const run = async (a: Act) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await setRole(u.uid, a.to)
      setConfirming(null)
    } catch (e) {
      setError(`Couldn't ${a.label.toLowerCase()} ${u.name}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <li className="team-row">
      <div className="team-who">
        <b>{u.name}</b> <span className="muted">{u.email}</span> <span className="muted">· joined {fmtDate(u)}</span>
      </div>
      {isMe ? (
        <span className="muted">you</span>
      ) : (
        <div className="comment-actions">
          {confirming ? (
            <>
              <span>{confirming.label}?</span>
              <button disabled={busy} onClick={() => run(confirming)}>Yes</button>
              <button disabled={busy} onClick={() => setConfirming(null)}>No</button>
            </>
          ) : (
            ACTIONS[u.role].map((a) => (
              <button key={a.label} disabled={busy} onClick={() => (a.confirm ? setConfirming(a) : run(a))}>{a.label}</button>
            ))
          )}
        </div>
      )}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </li>
  )
}

function List({ users, meUid, empty }: { users: TeamUser[]; meUid: string; empty: string }) {
  if (users.length === 0) return <p className="muted">{empty}</p>
  return <ul className="team-list">{users.map((u) => <Row key={u.uid} u={u} isMe={u.uid === meUid} />)}</ul>
}

export default function TeamPage() {
  const { me } = useAuth()
  const [users, setUsers] = useState<TeamUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setError(null)
        setUsers(snap.docs.map((d) => ({ ...(d.data() as UserDoc), uid: d.id })))
      },
      (e) => setError(`Couldn't load the team: ${e.message}`),
    )
  }, [])

  const groups = useMemo(() => teamGroups(users ?? []), [users])
  const meUid = me?.uid ?? ''

  return (
    <div className="team">
      <h1>Team</h1>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {users === null && !error && <p className="muted">Loading…</p>}
      {users !== null && (
        <>
          <section className={groups.waiting.length ? 'team-waiting' : undefined}>
            <h2>Waiting ({groups.waiting.length})</h2>
            <List users={groups.waiting} meUid={meUid} empty="Nobody waiting." />
          </section>
          <section>
            <h2>Admins ({groups.admin.length})</h2>
            <List users={groups.admin} meUid={meUid} empty="No admins." />
          </section>
          <section>
            <h2>Members ({groups.member.length})</h2>
            <List users={groups.member} meUid={meUid} empty="No members yet." />
          </section>
          <details>
            <summary>Removed ({groups.removed.length})</summary>
            <List users={groups.removed} meUid={meUid} empty="Nobody removed." />
          </details>
        </>
      )}
    </div>
  )
}
