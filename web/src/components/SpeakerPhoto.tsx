// Link-only for now; a rendered photo (from fileId, Storage) can replace this later.
export default function SpeakerPhoto({ fileId, url }: { fileId: string | null; url: string }) {
  if (!url && !fileId) return null
  return url ? <a href={url} target="_blank" rel="noopener noreferrer">Open photo ↗</a> : null
}
