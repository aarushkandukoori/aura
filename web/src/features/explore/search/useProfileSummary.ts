import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { formatCount } from '../../../lib/format'
import type { Account, Profile } from '../../../lib/types'

/**
 * Search returns plain accounts without follower numbers, so the second line of a result
 * ("Followed by maya + 2 more" or "12.4K followers") comes from that person's profile. Each
 * profile is fetched once and remembered for the rest of the visit.
 */
const profiles = new Map<string, Profile>()

export function useProfileSummary(username: string, enabled: boolean): Profile | null {
  const [profile, setProfile] = useState(() => profiles.get(username) ?? null)

  useEffect(() => {
    if (!enabled || profile) return
    let cancelled = false
    api
      .profile(username)
      .then((result) => {
        profiles.set(username, result)
        if (!cancelled) setProfile(result)
      })
      .catch(() => {}) // the row just keeps its simpler second line
    return () => {
      cancelled = true
    }
  }, [username, enabled, profile])

  return profile
}

/** "Following", "Followed by maya + 2 more", "12.4K followers", "Follows you" or "". */
export function socialLine(account: Account, profile: Profile | null): string {
  if (account.kind === 'me') return ''
  if (account.iFollow) return 'Following'
  if (profile && profile.mutualCount > 0 && profile.mutuals[0]) {
    const more = profile.mutualCount - 1
    return `Followed by ${profile.mutuals[0].username}${more > 0 ? ` + ${more} more` : ''}`
  }
  if (profile) return `${formatCount(profile.followers)} ${profile.followers === 1 ? 'follower' : 'followers'}`
  return account.followsMe ? 'Follows you' : ''
}
