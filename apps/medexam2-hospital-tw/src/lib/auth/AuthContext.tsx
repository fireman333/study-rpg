// React context + Provider + hook for Supabase Auth (M4 — 二階 mirror).
// Copied verbatim from apps/medexam-tw/src/lib/auth/AuthContext.tsx — same
// behavior, same auth state shape.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from './client'

export type AuthStatus = 'initializing' | 'authed' | 'unauthed' | 'disabled'

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing')
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setStatus('disabled')
      return
    }

    let cancelled = false

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        console.warn('[auth] getSession failed', error)
        setStatus('unauthed')
        return
      }
      setSession(data.session)
      setStatus(data.session ? 'authed' : 'unauthed')
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (cancelled) return
      setSession(sess)
      setStatus(sess ? 'authed' : 'unauthed')
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    })
    if (error) {
      console.error('[auth] signInWithOAuth failed', error)
    }
  }

  const signOut = async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('[auth] signOut failed', error)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        session,
        user: session?.user ?? null,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return ctx
}
