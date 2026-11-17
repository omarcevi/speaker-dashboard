import { useState } from 'react'
import type { Submission } from '../../../functions/src/model.ts'
import { comingFrom } from '../lib/logistics.ts'
import { IconLink, IconMail, IconPhone } from './Icons.tsx'
import SpeakerPhoto from './SpeakerPhoto.tsx'

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

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1200)
    } catch {
      // clipboard blocked: the value is still selectable on screen
    }
  }
  return <button type="button" className="copy" aria-label={done ? `Copied the ${label}` : `Copy ${label}`} aria-live="polite" onClick={() => void copy()}>{done ? 'Copied' : 'Copy'}</button>
}

// Email and phone with Copy, then the profile links. Hidden in projector view (the whole room can see the screen).
export function ContactList({ email, phone, links }: { email: string; phone: string; links?: Submission['links'] }) {
  const shown = links ? LINKS.filter(([k]) => links[k]) : []
  if (!email && !phone && shown.length === 0) return null
  return (
    <ul className="contact ruled" aria-label="Contact details">
      {email && <li><IconMail /><a href={`mailto:${email}`}>{email}</a><CopyButton text={email} label="email" /></li>}
      {phone && <li><IconPhone /><a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a><CopyButton text={phone} label="phone number" /></li>}
      {links && shown.map(([k, label]) => (
        <li key={k}><IconLink /><a href={links[k]} target="_blank" rel="noopener noreferrer">{label} <span className="muted">{links[k].replace(/^https?:\/\/(www\.)?[^/]+\/?/, '') || links[k]}</span></a><span /></li>
      ))}
    </ul>
  )
}

function More({ label, text, open = false }: { label: string; text: string; open?: boolean }) {
  if (!text.trim()) return null
  return <details className="more" open={open}><summary>{label}</summary><p>{text}</p></details>
}

export default function SpeakerPanel({ sub }: { sub: Submission }) {
  const name = `${sub.firstName} ${sub.lastName}`.trim()
  const role = [sub.jobTitle, sub.company].filter(Boolean).join(', ')
  const from = comingFrom(sub.logistics)
  return (
    <section className="card pad" aria-label="Speaker">
      <div className="speaker-head">
        <SpeakerPhoto key={sub.photoFileId ?? 'none'} fileId={sub.photoFileId} url={sub.photoUrl} name={name} />
        <div><b>{name}</b>{role && <span className="muted">{role}</span>}</div>
      </div>
      <ContactList email={sub.email} phone={sub.phone} links={sub.links} />
      <dl className="kv" style={{ margin: '16px 0' }}>
        <dt>GDE</dt><dd>{sub.gde || <span className="dash">—</span>}</dd>
        <dt>Coming from</dt><dd>{from.place ? <>{from.place}{from.note && <span className="muted"> · {from.note}</span>}</> : <span className="dash">—</span>}</dd>
        {CONSENTS.map(([k, label]) => (
          <div key={k} style={{ display: 'contents' }}><dt>{label}</dt><dd>{sub.consent[k] || <span className="muted">Not answered</span>}</dd></div>
        ))}
      </dl>
      <More label="Bio" text={sub.bio} />
      <More label="Speaking experience" text={sub.speakingExperience} open />
      <More label="Why DevFest Istanbul" text={sub.whyDevFest} />
      <More label="Anything else" text={sub.anythingElse} />
    </section>
  )
}
