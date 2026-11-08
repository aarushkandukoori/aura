import { Feed } from './Feed'
import { RightRail } from './RightRail'

/**
 * "/" - the home screen. The feed column (470 px) is centered; from 1160 px wide the right rail
 * sits next to it. On phones the layout adds the top bar with the wordmark above it.
 */
export function HomePage() {
  return (
    <div className="flex justify-center gap-16 md:px-5 md:pt-6 xl:gap-20">
      <div className="w-full min-w-0 max-w-[470px]">
        <Feed />
      </div>
      <aside className="hidden w-[320px] shrink-0 min-[1160px]:block">
        <RightRail />
      </aside>
    </div>
  )
}
