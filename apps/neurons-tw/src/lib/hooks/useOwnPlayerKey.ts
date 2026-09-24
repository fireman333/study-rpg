import { useEffect, useState } from 'react'
import { fetchMyPlayerKey } from '../services/neurons-leaderboard'

/**
 * The signed-in player's public key on the neurons leaderboard and 留言 board
 * (change hash-leaderboard-user-ids). `null` while signed out, while loading, or
 * when the Worker could not supply one — in every such case no row or message is
 * treated as the player's own, which is the safe reading.
 *
 * ⚠️ Compare this against `row.player_key` / `message.playerKey`. Never compare
 * the auth user id against a public row: public rows no longer carry it.
 */
export function useOwnPlayerKey(accessToken: string | null): string | null {
  const [key, setKey] = useState<string | null>(null)
  useEffect(() => {
    setKey(null)
    if (!accessToken) return
    let cancelled = false
    void fetchMyPlayerKey(accessToken).then((k) => {
      if (!cancelled) setKey(k)
    })
    return () => {
      cancelled = true
    }
  }, [accessToken])
  return key
}
