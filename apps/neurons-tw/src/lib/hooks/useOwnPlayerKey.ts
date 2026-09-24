import { useEffect, useRef, useState } from 'react'
import { fetchMyPlayerKey } from '../services/neurons-leaderboard'

/**
 * The signed-in player's public key on the neurons leaderboard and 留言 board
 * (change hash-leaderboard-user-ids). `null` while signed out, while loading, or
 * when the Worker could not supply one — in every such case no row or message is
 * treated as the player's own, which is the safe reading.
 *
 * Keyed on the ACCOUNT, not the token: Supabase refreshes the access token about
 * hourly, and a refetch per refresh would drop the key to `null` for a moment each
 * time (the own-row highlight and own-halo flicker off). The token is read through
 * a ref at fetch time; only its presence is a dependency, so the first fetch waits
 * for it. The result is tagged with the account it was fetched for, so a switch of
 * account never shows the previous account's key for a render.
 *
 * ⚠️ Compare this against `row.player_key` / `message.playerKey`. Never compare
 * the auth user id against a public row: public rows no longer carry it.
 */
export function useOwnPlayerKey(userId: string | null, accessToken: string | null): string | null {
  const token = useRef(accessToken)
  token.current = accessToken
  const hasToken = accessToken !== null
  const [fetched, setFetched] = useState<{ userId: string; key: string | null } | null>(null)
  useEffect(() => {
    const current = token.current
    if (!userId || !current) return
    let cancelled = false
    void fetchMyPlayerKey(current).then((key) => {
      if (!cancelled) setFetched({ userId, key })
    })
    return () => {
      cancelled = true
    }
  }, [userId, hasToken])
  return userId !== null && fetched?.userId === userId ? fetched.key : null
}
