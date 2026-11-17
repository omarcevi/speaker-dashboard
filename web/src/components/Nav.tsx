import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useAuth } from '../auth/AuthProvider.tsx'
import { db } from '../firebase.ts'
import { initials } from '../lib/initials.ts'
import { IconBag, IconList, IconMap, IconMenu, IconOut, IconTeam, IconUpload, Mark } from './Icons.tsx'

// Admins only: how many people are waiting for approval, shown on the Team link.
function useWaitingCount(admin: boolean): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!admin) return
    return onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'waiting')),
      (snap) => setN(snap.size),
      (e) => console.error('Waiting-count listener failed', e),
    )
  }, [admin])
  return admin ? n : 0
}

function Item({ to, icon, label, end, extra }: { to: string; icon: ReactNode; label: string; end?: boolean; extra?: ReactNode }) {
  return <NavLink to={to} end={end}>{icon}<span>{label}</span>{extra}</NavLink>
}

export default function Nav() {
  const { me, signOut } = useAuth()
  const admin = me?.role === 'admin'
  const waiting = useWaitingCount(admin)
  const { pathname } = useLocation()
  // On narrow screens the menu is open for the page it was opened on, so back/forward closes it without an effect;
  // following any link in it (even to the page you're on) closes it too.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const side = useRef<HTMLElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)

  const toggle = () => {
    if (open) { setOpenOn(null); return }
    setOpenOn(pathname)
    requestAnimationFrame(() => side.current?.querySelector<HTMLElement>('.nav a')?.focus())
  }

  return (
    <>
      <header className="topbar">
        <Link className="mark" to="/"><Mark /></Link>
        <button ref={menuButton} className="icon-btn" aria-label="Menu" aria-expanded={open} aria-controls="main-nav" onClick={toggle}><IconMenu /></button>
      </header>
      <aside id="main-nav" ref={side} className={open ? 'side open' : 'side'} aria-label="Main"
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { setOpenOn(null); menuButton.current?.focus() } }}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpenOn(null) }}>
        <Link className="mark" to="/"><Mark /></Link>
        <nav className="nav">
          <Item to="/" end icon={<IconList />} label="Submissions" />
          <Item to="/map" icon={<IconMap />} label="Topic map" />
          <Item to="/logistics" icon={<IconBag />} label="Logistics" />
          {admin && (
            <>
              <div className="group">Admin</div>
              <Item to="/team" icon={<IconTeam />} label="Team"
                extra={waiting > 0 ? <span className="tag" style={{ marginLeft: 'auto' }}>{waiting} waiting</span> : undefined} />
              <Item to="/import" icon={<IconUpload />} label="Import" />
            </>
          )}
        </nav>
        <span className="grow" />
        <div className="user">
          <span className="avatar">{initials(me?.name || me?.email || '?')}</span>
          <span><b>{me?.name}</b><span>{admin ? 'Admin' : 'Member'}</span></span>
          <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}><IconOut /></button>
        </div>
      </aside>
    </>
  )
}
