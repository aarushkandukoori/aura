/**
 * Reels (SPEC screen 11): full-height reels you swipe through one at a time.
 * /reels starts with the newest; /reels/:id starts with that reel and continues with the rest.
 */
import { useParams } from 'react-router'
import { ReelsFeed } from './ReelsFeed'

export function ReelsPage() {
  const { id } = useParams()
  // A different start reel is a different list, so the feed starts over (keyed by it).
  return <ReelsFeed key={id ?? 'newest'} startId={id ?? null} />
}
