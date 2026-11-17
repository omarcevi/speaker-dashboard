import type { Card } from '../lib/cards.ts'
import { versionWarning } from '../lib/versionWarning.ts'
import AdvocuDetails from './AdvocuDetails.tsx'
import { ContactList } from './SpeakerPanel.tsx'

function Section({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null
  return <div className="section"><h3>{label}</h3><p className="prose">{text}</p></div>
}

export default function TalkPanel({ sub }: { sub: Card }) {
  const warning = versionWarning(sub)
  const co = sub.coSpeaker
  const presented = sub.presentedBefore.trim()
  return (
    <section className="card pad" aria-label="Talk details">
      {warning && <p className="notice" role="status" style={{ marginBottom: 20 }}>{warning}</p>}
      <Section label="Abstract" text={sub.abstract || (sub.noSession ? 'No session was submitted with this form response.' : '')} />
      <Section label="Key takeaways" text={sub.takeaways} />
      {presented && <Section label="Presented before" text={presented} />}
      <Section label="Talk history" text={sub.talkHistory} />
      {sub.advocu && <div className="section"><AdvocuDetails advocu={sub.advocu} sources={sub.sources} /></div>}
      {co && (
        <div className="section">
          <h3>Co-speaker</h3>
          <p className="prose"><b style={{ fontWeight: 500 }}>{co.firstName} {co.lastName}</b>{co.bio.trim() && <> · {co.bio}</>}</p>
          <ContactList email={co.email} phone={co.phone} links={{ linkedin: co.linkedin, x: co.x, instagram: co.instagram, github: '' }} />
          {/^https?:\/\//.test(co.photoUrl) && <p style={{ marginTop: 8 }}><a href={co.photoUrl} target="_blank" rel="noopener noreferrer">Open their photo</a></p>}
        </div>
      )}
    </section>
  )
}
