import { NavLink } from 'react-router-dom'
import { useData } from '../data/DataProvider.tsx'

// The Emails section's tabs, plus the mail problem banner every tab shows. The texts are code-only, no personal data.
export default function EmailsTabs() {
  const { mailMeta } = useData()
  return (
    <>
      <nav className="subnav" aria-label="Emails">
        <NavLink to="/emails" end>Conversations</NavLink>
        <NavLink to="/emails/templates">Templates</NavLink>
        <NavLink to="/emails/event">Event settings</NavLink>
      </nav>
      {mailMeta?.sendError && <div className="banner mail-banner" role="alert">Sending is failing: {mailMeta.sendError}</div>}
      {mailMeta?.pollError && <div className="banner mail-banner" role="alert">Checking for replies is failing: {mailMeta.pollError}</div>}
    </>
  )
}
