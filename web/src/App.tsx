import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider.tsx'
import { gate } from './auth/gate.ts'
import { DataProvider } from './data/DataProvider.tsx'
import Nav from './components/Nav.tsx'
import ListPage from './pages/ListPage.tsx'
import LogisticsPage from './pages/LogisticsPage.tsx'
import MeetingPage from './pages/MeetingPage.tsx'
import SignInPage from './pages/SignInPage.tsx'
import TeamPage from './pages/TeamPage.tsx'
import WaitingPage from './pages/WaitingPage.tsx'

function Shell() {
  const { state, me, error, signOut } = useAuth()
  const g = gate(state, me?.role ?? null)

  if (error && g === 'loading') {
    return (
      <main className="center-page">
        <p className="error">{error}</p>
        <button onClick={() => void signOut()}>Sign out</button>
      </main>
    )
  }
  if (g === 'loading') return <main className="center-page"><p>Loading…</p></main>
  if (g === 'signin') return <SignInPage />
  if (g === 'waiting' || g === 'removed') return <WaitingPage removed={g === 'removed'} />

  return (
    <DataProvider>
      <Nav />
      <main className="content">
        <Routes>
          <Route path="/" element={<ListPage />} />
          <Route path="/talk/:id" element={<MeetingPage />} />
          <Route path="/logistics" element={<LogisticsPage />} />
          <Route path="/team" element={me?.role === 'admin' ? <TeamPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </DataProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  )
}
