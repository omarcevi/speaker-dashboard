import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import type { UserDoc } from '../../../functions/src/model.ts'
import { auth, db } from '../firebase.ts'
import type { AuthState } from './gate.ts'

type Me = UserDoc & { uid: string }

interface AuthValue {
  user: User | null
  me: Me | null
  error: string | null
  state: AuthState
  signIn(): Promise<void>
  signOut(): Promise<void>
}

const ACCOUNT_ERROR = "Couldn't load your account. Try signing out and in again."

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [state, setState] = useState<AuthState>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u)
        setState(u ? 'signedIn' : 'signedOut')
        if (!u) {
          setMe(null)
          setError(null)
        }
      }),
    [],
  )

  const uid = user?.uid
  useEffect(() => {
    if (!user || !uid) return
    const ref = doc(db, 'users', uid)
    let creating = false
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setError(null)
          setMe({ ...(snap.data() as UserDoc), uid })
        } else if (!creating && !snap.metadata.fromCache) {
          creating = true
          const email = user.email ?? ''
          setDoc(ref, {
            email,
            name: user.displayName ?? email,
            photoURL: user.photoURL ?? '',
            role: 'waiting',
            createdAt: serverTimestamp(),
          }).catch((e) => {
            console.error('Could not create user doc', e)
            creating = false
            setError(ACCOUNT_ERROR)
          })
        }
      },
      (e) => {
        console.error('User doc listener failed', e)
        setError(ACCOUNT_ERROR)
      },
    )
    return unsub
  }, [uid])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      me,
      error,
      state,
      signIn: async () => {
        await signInWithPopup(auth, new GoogleAuthProvider())
      },
      signOut: () => fbSignOut(auth),
    }),
    [user, me, error, state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
