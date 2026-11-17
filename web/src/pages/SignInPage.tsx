import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { Mark } from '../components/Icons.tsx'

export default function SignInPage() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    setError(null)
    try {
      await signIn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
    }
  }

  return (
    <main className="solo">
      <div className="card">
        <div className="mark" style={{ padding: 0 }}><Mark /></div>
        <h1>Sign in to review talks</h1>
        <p>For the DevFest Istanbul organizing team. New people get access once an admin approves them.</p>
        <button className="btn primary google-btn" onClick={() => void onClick()}>Sign in with Google</button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </main>
  )
}
