import { factsCounter } from '../lib/speakerFacts.ts'

/** The "Speaker facts" setting: a textarea for admins, plain text for members. */
export function SpeakerFacts({ admin, value, onChange }: { admin: boolean; value: string; onChange: (v: string) => void }) {
  const { label, over } = factsCounter(value)
  return (
    <section className="setting">
      <div className="about">
        <h2>Speaker facts</h2>
        <p>What reply drafts may state. Anything not here becomes a [gap] in the draft.</p>
        {!admin && <p>Only admins can change it.</p>}
      </div>
      <div className="card pad">
        {admin ? (
          <>
            <textarea className="area" aria-label="Speaker facts" aria-describedby="facts-count" value={value}
              onChange={(e) => onChange(e.target.value)} />
            <div className={over ? 'inline-error' : 'hint'} id="facts-count" style={{ marginTop: 4 }} role={over ? 'alert' : undefined}>
              {label}{over && ' · too long to save'}
            </div>
          </>
        ) : value.trim() === '' ? <p className="muted">No speaker facts yet.</p> : <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{value}</p>}
      </div>
    </section>
  )
}
