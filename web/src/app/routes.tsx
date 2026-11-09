/**
 * Every route in the app (SPEC section 9).
 *
 * The first <Routes> draws the page. When the location carries `state.background` (see
 * app/navigation.ts) and points at an overlay route, the first <Routes> keeps drawing the background
 * page and the second <Routes> draws the modal or full-screen viewer on top of it.
 */
import type { ReactNode } from 'react'
import { matchPath, Route, Routes, useLocation } from 'react-router'
import { NotFound } from '../components'
import { ActivityPage } from '../features/activity'
import { SignInPage } from '../features/auth'
import { CreatePage } from '../features/create'
import { ExplorePage, SearchPage, TagPage } from '../features/explore'
import { HomePage } from '../features/feed'
import { MessagesPage } from '../features/messages'
import { OnboardingPage } from '../features/onboarding'
import { LikesPage, PostDetailPage } from '../features/post'
import { EditProfilePage, FollowListPage, ProfilePage, SavedPage } from '../features/profile'
import { ReelsPage } from '../features/reels'
import { SettingsPage } from '../features/settings'
import { HighlightViewerPage, StoryComposerPage, StoryViewerPage } from '../features/stories'
import { useLockBodyScroll } from '../lib/hooks'
import { ErrorBoundary } from './ErrorBoundary'
import { AppLayout } from './layout/AppLayout'
import type { NavState } from './navigation'
import { RouteModal } from './RouteModal'

/** Routes that may open on top of another page. */
const OVERLAY_PATHS = ['/p/:id', '/p/:id/likes', '/create', '/create/story', '/stories/:username', '/highlights/:id']

export function AppRoutes() {
  const location = useLocation()
  const saved = (location.state as NavState | null)?.background
  const isOverlay = OVERLAY_PATHS.some((pattern) => matchPath(pattern, location.pathname))
  const background = saved && isOverlay ? saved : null

  return (
    <>
      <Routes location={background ?? location}>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        {/* Direct loads of the full-screen viewers (nothing underneath). */}
        <Route path="/stories/:username" element={<FullScreen><StoryViewerPage /></FullScreen>} />
        <Route path="/highlights/:id" element={<FullScreen><HighlightViewerPage /></FullScreen>} />
        <Route path="/create/story" element={<FullScreen><StoryComposerPage /></FullScreen>} />

        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="explore/tags/:tag" element={<TagPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="reels" element={<ReelsPage />} />
          <Route path="reels/:id" element={<ReelsPage />} />
          <Route path="create" element={<CreatePage />} />
          <Route path="p/:id" element={<PostDetailPage />} />
          <Route path="p/:id/likes" element={<LikesPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="messages/new" element={<MessagesPage />} />
          <Route path="messages/:id" element={<MessagesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/profile" element={<EditProfilePage />} />
          <Route path="saved" element={<SavedPage />} />
          <Route path=":username" element={<ProfilePage />} />
          <Route path=":username/reels" element={<ProfilePage />} />
          <Route path=":username/tagged" element={<ProfilePage />} />
          <Route path=":username/followers" element={<FollowListPage mode="followers" />} />
          <Route path=":username/following" element={<FollowListPage mode="following" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>

      {background && (
        <Routes>
          <Route path="/p/:id" element={<RouteModal label="Post"><PostDetailPage /></RouteModal>} />
          <Route path="/p/:id/likes" element={<RouteModal label="Likes"><LikesPage /></RouteModal>} />
          <Route path="/create" element={<RouteModal label="Make a post"><CreatePage /></RouteModal>} />
          <Route path="/create/story" element={<FullScreen><StoryComposerPage /></FullScreen>} />
          <Route path="/stories/:username" element={<FullScreen><StoryViewerPage /></FullScreen>} />
          <Route path="/highlights/:id" element={<FullScreen><HighlightViewerPage /></FullScreen>} />
        </Routes>
      )}
    </>
  )
}

/**
 * Wraps the full-screen viewers (stories, highlights, story composer): the page underneath stops
 * scrolling, colors inside use the dark theme (these screens are black), and a crash in the viewer
 * never blanks the page underneath.
 */
function FullScreen({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  useLockBodyScroll()
  return (
    <div className="dark">
      <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
    </div>
  )
}
