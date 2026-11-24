import { collection, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import type { ReceivedMessage } from '../../../functions/src/model.ts'
import { db } from '../firebase.ts'

export type ThreadMessage = ReceivedMessage & { id: string }

/** One listener on a thread's received messages, while the caller is mounted. `messages` is null until loaded. */
export function useThreadMessages(threadId: string): { messages: ThreadMessage[] | null; loadError: string | null } {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    return onSnapshot(
      collection(db, 'threads', threadId, 'messages'),
      (snap) => {
        setLoadError(null)
        setMessages(snap.docs.map((d) => ({ ...(d.data() as ReceivedMessage), id: d.id })))
      },
      (e) => {
        console.error('Messages listener failed', e)
        setLoadError("Couldn't load the replies in this conversation.")
      },
    )
  }, [threadId])
  return { messages, loadError }
}
