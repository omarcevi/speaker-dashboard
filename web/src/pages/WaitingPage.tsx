import { useAuth } from '../auth/AuthProvider.tsx'

export default function WaitingPage({ removed }: { removed: boolean }) {
  const { me, signOut } = useAuth()
  return (
    <main className="center-page">
      <h1>Speaker Dashboard</h1>
      <p>
        {removed
          ? 'Your access to this dashboard was removed.'
          : 'Thanks, an admin needs to approve your access.'}
      </p>
      {me?.email && <p className="muted">Signed in as {me.email}</p>}
      <button onClick={() => void signOut()}>Sign out</button>
    </main>
  )
}
