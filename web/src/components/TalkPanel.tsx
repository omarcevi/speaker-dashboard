import type { Status, Submission } from '../../../functions/src/model.ts'
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

export default function TalkPanel({ sub, status }: { sub: Submission; status: Status }) {
  const co = sub.coSpeaker
  return (
    <section className="talk-panel">
      <div className="chips">
        <StatusChip status={status} />
        {sub.topicGroup && <span className="chip">{sub.topicGroup}</span>}
        {sub.level && <span className="chip">{sub.level}</span>}
        {sub.language && <span className="chip">{sub.language}</span>}
        {sub.presentedBefore && <span className="chip">Presented before: {sub.presentedBefore}</span>}
        {sub.noSession && <span className="tag">No session</span>}
        {sub.removedFromSheet && <span className="tag">Removed</span>}
      </div>
      <h2 className="talk-title">{sub.title}</h2>
      <Section label="Abstract" text={sub.abstract} />
      <Section label="Key takeaways" text={sub.takeaways} />
      <Section label="Talk history" text={sub.talkHistory} />
      {co && (
        <>
          <div className="lbl">Co-speaker</div>
          <p>
            <b>{co.firstName} {co.lastName}</b>
            {co.photoUrl && <> · <a href={co.photoUrl} target="_blank" rel="noopener noreferrer">Open photo ↗</a></>}
          </p>
          {co.bio.trim() && <p className="prose">{co.bio}</p>}
        </>
      )}
      <div className="comments-slot">{/* Task 9: Comments */}</div>
    </section>
  )
}
