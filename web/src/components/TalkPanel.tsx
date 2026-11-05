import { Link } from 'react-router-dom'
import type { Status } from '../../../functions/src/model.ts'
import type { Comment } from '../../../functions/src/model.ts'
import type { Actor } from '../data/actions.ts'
import type { Card } from '../lib/cards.ts'
import AdvocuDetails from './AdvocuDetails.tsx'
import SourceBadge from './SourceBadge.tsx'
import Comments from './Comments.tsx'
import StatusHistory from './StatusHistory.tsx'
import StatusChip from './StatusChip.tsx'

function Section({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null
  return (
    <>
      <div className="lbl">{label}</div>
      <p className="prose">{text}</p>
    </>
  )
}

// The card shows a different document than the one reviewed (the reviewed primary was removed).
export function versionWarning(card: Card): string | null {
  if (card.displayId === card.id) return null
  return `Showing a different ${card.source === 'advocu' ? 'Advocu' : 'Form'} version than the one reviewed`
}

export default function TalkPanel({ sub, status, comments, me }: {
  sub: Card
  status: Status
  comments: (Comment & { id: string })[]
  me: Actor
}) {
  const co = sub.coSpeaker
  return (
    <section className="talk-panel">
      <div className="chips">
        <StatusChip status={status} />
        <SourceBadge sources={sub.sources} />
        {sub.topicGroup && <span className="chip">{sub.topicGroup}</span>}
        {sub.level && <span className="chip">{sub.level}</span>}
        {sub.language && <span className="chip">{sub.language}</span>}
        {sub.presentedBefore && <span className="chip">Presented before: {sub.presentedBefore}</span>}
        {sub.noSession && <span className="tag">No session</span>}
        {sub.removedFromSheet && <span className="tag">Removed</span>}
        {sub.possibleDuplicateOf.length > 0 && (
          <span className="tag">
            Possible duplicate of{' '}
            {sub.possibleDuplicateOf.map((id, i) => (
              <span key={id}>{i > 0 && ', '}<Link to={`/talk/${id}`}>{id}</Link></span>
            ))}
          </span>
        )}
      </div>
      {versionWarning(sub) && <p className="warning" role="alert">{versionWarning(sub)}</p>}
      <StatusHistory key={`history-${sub.id}`} submissionId={sub.id} />
      <h2 className="talk-title">{sub.title}</h2>
      <Section label="Abstract" text={sub.abstract} />
      {sub.advocu && <AdvocuDetails advocu={sub.advocu} sources={sub.sources} />}
      <Section label="Key takeaways" text={sub.takeaways} />
      <Section label="Talk history" text={sub.talkHistory} />
      {co && (
        <>
          <div className="lbl">Co-speaker</div>
          <p>
            <b>{co.firstName} {co.lastName}</b>
            {/^https?:\/\//.test(co.photoUrl) && <> · <a href={co.photoUrl} target="_blank" rel="noopener noreferrer">Open photo ↗</a></>}
          </p>
          {co.bio.trim() && <p className="prose">{co.bio}</p>}
        </>
      )}
      <div className="comments-slot"><Comments key={sub.id} submissionId={sub.id} comments={comments} me={me} /></div>
    </section>
  )
}
