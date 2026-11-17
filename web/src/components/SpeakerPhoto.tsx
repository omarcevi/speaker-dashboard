import { useEffect, useState } from 'react'
import { getDownloadURL, ref } from 'firebase/storage'
import { storage } from '../firebase'
import { initials } from '../lib/initials.ts'

type Load = { state: 'loading' } | { state: 'ready'; src: string } | { state: 'failed' }

// The synced photo from Storage. Without one, the speaker's initials; when the form only has a Drive link, the
// initials open it.
export default function SpeakerPhoto({ fileId, url, name }: { fileId: string | null; url: string; name: string }) {
  const [load, setLoad] = useState<Load>({ state: fileId ? 'loading' : 'failed' })

  useEffect(() => {
    if (!fileId) { setLoad({ state: 'failed' }); return }
    let current = true
    setLoad({ state: 'loading' })
    getDownloadURL(ref(storage, 'photos/' + fileId)).then(
      src => { if (current) setLoad({ state: 'ready', src }) },
      () => { if (current) setLoad({ state: 'failed' }) },
    )
    return () => { current = false }
  }, [fileId])

  if (load.state === 'ready') {
    return <img className="photo" src={load.src} alt={`Photo of ${name}`} onError={() => setLoad({ state: 'failed' })} />
  }
  const face = <span className="portrait" aria-hidden="true">{load.state === 'failed' ? initials(name) : ''}</span>
  return load.state === 'failed' && /^https?:\/\//.test(url)
    ? <a className="photo-link" href={url} target="_blank" rel="noopener noreferrer" title="Open the photo they uploaded" aria-label={`Open the photo ${name} uploaded`}>{face}</a>
    : face
}
