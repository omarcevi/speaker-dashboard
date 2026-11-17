import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import type { Role, UserDoc } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { setRole } from '../data/actions.ts'
import { db } from '../firebase.ts'
import { initials } from '../lib/initials.ts'
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
    <li>
      <span className="avatar" aria-hidden="true">{initials(u.name || u.email)}</span>
      <span style={{ minWidth: 0 }}>
        <b>{u.name}</b>
        <span>{u.email} · joined {fmtDate(u)}</span>
        {error && <span className="inline-error" role="alert" style={{ display: 'block' }}>{error}</span>}
      </span>
      {isMe ? (
        <span className="muted">You</span>
      ) : (
        <span className="acts">
          {confirming ? (
            <>
              <span style={{ alignSelf: 'center' }}>{confirming.label} {u.name.split(' ')[0]}?</span>
              <button className="btn sm" disabled={busy} onClick={() => run(confirming)}>{confirming.label}</button>
              <button className="btn text sm" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
            </>
          ) : (
            ACTIONS[u.role].map((a, i) => (
              <button key={a.label} className={i === 0 && u.role === 'waiting' ? 'btn sm primary' : 'btn sm'} disabled={busy}
                onClick={() => (a.confirm ? setConfirming(a) : run(a))}>{a.label}</button>
            ))
          )}
        </span>
      )}
    </li>
  )
}

function List({ users, meUid, empty }: { users: TeamUser[]; meUid: string; empty: string }) {
  if (users.length === 0) return <p className="muted">{empty}</p>
  return <ul className="people">{users.map((u) => <Row key={u.uid} u={u} isMe={u.uid === meUid} />)}</ul>
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

  const section = (title: string, about: string, list: TeamUser[], empty: string) => (
    <section className="setting" key={title}>
      <div className="about"><h2>{title} <span className="muted num">{list.length}</span></h2><p>{about}</p></div>
      <div className="card pad"><List users={list} meUid={meUid} empty={empty} /></div>
    </section>
  )
  const reviewers = groups.admin.length + groups.member.length

  return (
    <>
      <div className="title-row">
        <div><h1>Team</h1>{users !== null && <p className="lede">{reviewers} {reviewers === 1 ? 'person can' : 'people can'} review · {groups.waiting.length} waiting</p>}</div>
      </div>
      {error && <div className="banner" role="alert" style={{ marginTop: 16 }}>{error}</div>}
      {users === null && !error && <p className="muted" style={{ marginTop: 24 }}>Loading…</p>}
      {users !== null && (
        <div className="settings">
          {section('Waiting for approval', "They signed in with Google and can't see any data until you approve them.", groups.waiting, 'Nobody is waiting.')}
          {section('Admins', 'Can set decisions, manage the team and import from Advocu.', groups.admin, 'No admins.')}
          {section('Members', 'Can read every talk, score and comment.', groups.member, 'No members yet.')}
          {section('Removed', 'Lost access. Their past scores and comments stay.', groups.removed, 'Nobody removed.')}
        </div>
      )}
    </>
  )
}
