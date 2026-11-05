import { NavLink } from 'react-router-dom'
import { useData } from '../data/DataProvider.tsx'
import { useAuth } from '../auth/AuthProvider.tsx'

export default function Nav() {
  const { me, signOut } = useAuth()
  const { error } = useData()
  return (
    <>
    <nav className="nav">
      <NavLink to="/" end>Submissions</NavLink>
      <NavLink to="/logistics">Logistics</NavLink>
      {me?.role === 'admin' && <NavLink to="/team">Team</NavLink>}
      <span className="spacer" />
      <span className="who">{me?.name}</span>
      <button onClick={() => void signOut()}>Sign out</button>
    </nav>
    {error && <div className="banner" role="alert">{error}</div>}
    </>
  )
}
