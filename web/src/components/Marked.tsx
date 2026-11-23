import { previewSegments } from '../lib/emails.ts'

// Template text with each {{fill-in}} shown as its value (grey mark), or as a dashed box when unknown or empty.
export default function Marked({ text, values }: { text: string; values: Record<string, string> }) {
  return (
    <>
      {previewSegments(text, values).map((s, i) =>
        s.kind === 'text' ? <span key={i}>{s.text}</span>
          : s.kind === 'fill' ? <span key={i} className="fill">{s.text}</span>
            : <span key={i} className="fill bad" title={s.why === 'unknown' ? 'Unknown fill-in' : 'Empty for this speaker'}>{s.text}</span>)}
    </>
  )
}
