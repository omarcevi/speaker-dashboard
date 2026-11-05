import { Link } from 'react-router-dom'
import type { Review, Submission } from '../../../functions/src/model.ts'
import { statusOf } from '../lib/status.ts'
import SpeakerPhoto from './SpeakerPhoto.tsx'
import StatusChip from './StatusChip.tsx'

interface Props {
  sub: Submission
  others: Submission[]
  reviews: Map<string, Review>
  query: string
}

const LINKS = [
  ['linkedin', 'LinkedIn'],
  ['x', 'X'],
  ['github', 'GitHub'],
  ['instagram', 'Instagram'],
] as const

const CONSENTS = [
  ['codeOfConduct', 'Code of conduct'],
  ['recording', 'Recording'],
  ['personalData', 'Personal data'],
] as const

function Details({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null
  return (
    <details>
      <summary>{label}</summary>
      <p className="prose">{text}</p>
    </details>
  )
}

export default function SpeakerPanel({ sub, others, reviews, query }: Props) {
  const from = sub.logistics.abroadFrom || sub.logistics.city
  const role = [sub.jobTitle, sub.company].filter(Boolean).join(' · ')
  return (
    <section className="speaker-panel">
      <div className="speaker-head">
        <SpeakerPhoto key={sub.photoFileId ?? 'none'} fileId={sub.photoFileId} url={sub.photoUrl} />
        <div>
          <b>{sub.firstName} {sub.lastName}</b>
          {role && <div className="muted">{role}</div>}
        </div>
      </div>
      <div className="chips">
        {LINKS.map(([key, label]) => sub.links[key] && (
          <a key={key} className="chip" href={sub.links[key]} target="_blank" rel="noopener noreferrer">{label} ↗</a>
        ))}
        {sub.gde && <span className="chip">GDE: {sub.gde}</span>}
        {from && <span className="chip">From: {from}</span>}
      </div>
      {sub.speakingExperience.trim() && (
        <>
          <div className="lbl">Speaking experience</div>
          <p className="prose">{sub.speakingExperience}</p>
        </>
      )}
      <Details label="Bio" text={sub.bio} />
      <Details label="Why DevFest Istanbul" text={sub.whyDevFest} />
      <Details label="Anything to tell us" text={sub.anythingElse} />
      <div className="lbl">Consent</div>
      <div className="chips">
        {CONSENTS.map(([key, label]) => (
          <span key={key} className="chip">{label}: {sub.consent[key] || 'not answered'}</span>
        ))}
      </div>
      {others.length > 0 && (
        <>
          <div className="lbl">Other submissions ({others.length})</div>
          {others.map((o) => (
            <Link key={o.id} className="other-talk" to={`/talk/${o.id}${query ? `?${query}` : ''}`}>
              <StatusChip status={statusOf(reviews, o.id)} /> {o.title}
            </Link>
          ))}
        </>
      )}
    </section>
  )
}
