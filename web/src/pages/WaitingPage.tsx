import { useAuth } from '../auth/AuthProvider.tsx'
import { Mark } from '../components/Icons.tsx'

export default function WaitingPage({ removed }: { removed: boolean }) {
  const { me, signOut } = useAuth()
  return (
    <main className="solo">
      <div className="card">
        <div className="mark" style={{ padding: 0 }}><Mark /></div>
        {removed ? (
          <>
            <h1>Your access was removed</h1>
            <p>Ask one of the organizers if you think this is a mistake.</p>
          </>
        ) : (
          <>
            <h1>Thanks, you're signed in</h1>
            <p>An admin needs to approve your access before you can see submissions. Ask one of the organizers if it takes long.</p>
          </>
        )}
        {me?.email && <p>Signed in as {me.email}</p>}
        <button className="btn google-btn" onClick={() => void signOut()}>Sign out</button>
      </div>
    </main>
  )
}
