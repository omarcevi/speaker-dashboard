import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'

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
    <main className="center-page">
      <h1>Speaker Dashboard</h1>
      <p>Sign in with your Google account to review submissions.</p>
      <button className="primary" onClick={onClick}>Sign in with Google</button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
