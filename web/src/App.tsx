import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider.tsx'
import { gate } from './auth/gate.ts'
import { DataProvider, useData } from './data/DataProvider.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import Nav from './components/Nav.tsx'
import EmailsPage from './pages/EmailsPage.tsx'
import EventSettingsPage from './pages/EventSettingsPage.tsx'
import ImportPage from './pages/ImportPage.tsx'
import ListPage from './pages/ListPage.tsx'
import LogisticsPage from './pages/LogisticsPage.tsx'
import MeetingPage from './pages/MeetingPage.tsx'
import TopicMapPage from './pages/TopicMapPage.tsx'
import SendPage from './pages/SendPage.tsx'
import SignInPage from './pages/SignInPage.tsx'
import TeamPage from './pages/TeamPage.tsx'
import TemplateEditPage from './pages/TemplateEditPage.tsx'
import TemplatesPage from './pages/TemplatesPage.tsx'
import WaitingPage from './pages/WaitingPage.tsx'

function DataBanner() {
  const { error } = useData()
  return error ? <div className="banner" role="alert">{error}</div> : null
}

function Shell() {
  const { state, me, error, signOut } = useAuth()
  const g = gate(state, me?.role ?? null)

  if (error && g === 'loading') {
    return (
      <main className="center-page">
        <p className="error">{error}</p>
        <button className="btn" onClick={() => void signOut()}>Sign out</button>
      </main>
    )
  }
  if (g === 'loading') return <main className="center-page"><p>Loading…</p></main>
  if (g === 'signin') return <SignInPage />
  if (g === 'waiting' || g === 'removed') return <WaitingPage removed={g === 'removed'} />

  return (
    <DataProvider>
      <div className="app">
        <Nav />
        <main className="canvas">
          <DataBanner />
          <Routes>
          <Route path="/" element={<ListPage />} />
          <Route path="/talk/:id" element={<MeetingPage />} />
          <Route path="/logistics" element={<LogisticsPage />} />
          <Route path="/map" element={<TopicMapPage />} />
          <Route path="/emails" element={<EmailsPage />} />
          <Route path="/emails/templates" element={<TemplatesPage />} />
          <Route path="/emails/templates/new" element={<TemplateEditPage />} />
          <Route path="/emails/templates/:id" element={<TemplateEditPage />} />
          <Route path="/emails/templates/:id/send" element={<SendPage />} />
          <Route path="/emails/send" element={<SendPage />} />
          <Route path="/emails/event" element={<EventSettingsPage />} />
          <Route path="/team" element={me?.role === 'admin' ? <TeamPage /> : <Navigate to="/" replace />} />
          <Route path="/import" element={me?.role === 'admin' ? <ImportPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </DataProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
