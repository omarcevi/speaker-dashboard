import { useEffect, useState } from 'react'
import { getDownloadURL, ref } from 'firebase/storage'
import { storage } from '../firebase'

type Load = { state: 'loading' } | { state: 'ready'; src: string } | { state: 'failed' }

const circle = { width: 96, height: 96, borderRadius: '50%' } as const

export default function SpeakerPhoto({ fileId, url }: { fileId: string | null; url: string }) {
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

  if (load.state === 'loading') return <div aria-hidden="true" style={{ ...circle, background: 'rgba(128,128,128,0.15)' }} />
  if (load.state === 'ready') {
    return <img src={load.src} alt="Speaker photo" width={96} height={96} style={{ ...circle, objectFit: 'cover' }}
      onError={() => setLoad({ state: 'failed' })} />
  }
  return /^https?:\/\//.test(url) ? <a href={url} target="_blank" rel="noopener noreferrer">Open photo ↗</a> : null
}
