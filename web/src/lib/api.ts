/**
 * Typed client for the Aura server. One function per endpoint in SPEC section 5.
 *
 *   const page = await api.feed()            // GET /api/feed
 *   await api.likePost(post.id)              // POST /api/posts/:id/like
 *
 * Every call returns the exact shape from shared/types.ts and throws ApiError on a 4xx/5xx,
 * with the server's `{ error }` text as the message.
 */
import type {
  Account, Badges, Comment, CommentLikeResponse, Conversation, ConversationsResponse,
  CreateCommentRequest, CreateConversationRequest, CreatePostRequest, CreateStoryRequest,
  FollowListResponse, Health, ID, LikeResponse, LikesResponse, Me, Message, Notification,
  OnboardingRequest, Page, Post, Profile, Reaction, SaveResponse, SearchResult, SendMessageRequest,
  Session, Settings, ShareRequest, Story, StoryReplyResponse, StoryTray, UpdateConversationRequest,
  UpdateMeRequest, UpdateSettingsRequest, UploadResponse, ViewersResponse, ViewResponse,
  WorldPlan, WorldPlanRequest,
} from './types'
import type { TrackRequest } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Ok = { ok: true }
type QueryValue = string | number | null | undefined

/**
 * Fired on window when the server answers 401: the session expired or was ended elsewhere.
 * The session gate (app/SessionGate.tsx) listens and shows the sign-in page.
 */
export const SIGNED_OUT_EVENT = 'aura:signed-out'

function noticeSignedOut(status: number): void {
  if (status === 401) window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
}

/** Build "?a=1&b=2", leaving out empty values. */
function query(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

const enc = encodeURIComponent

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "Can't reach Aura. Check your connection.")
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    noticeSignedOut(response.status)
    const message = data && typeof data.error === 'string' ? data.error : `Something went wrong (${response.status})`
    throw new ApiError(response.status, message)
  }
  return data as T
}

const get = <T>(path: string) => request<T>('GET', path)
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {})
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body)
const del = <T>(path: string) => request<T>('DELETE', path)

/** POST /api/upload: raw bytes with the file's own Content-Type. lib/upload.ts resizes first. */
async function upload(file: Blob, size?: { width: number; height: number }): Promise<UploadResponse> {
  const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' }
  if (size) {
    headers['X-Width'] = String(Math.round(size.width))
    headers['X-Height'] = String(Math.round(size.height))
  }
  let response: Response
  try {
    response = await fetch('/api/upload', { method: 'POST', headers, body: file })
  } catch {
    throw new ApiError(0, "Upload failed. Check your connection.")
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    noticeSignedOut(response.status)
    throw new ApiError(response.status, data?.error ?? `Upload failed (${response.status})`)
  }
  return data as UploadResponse
}

export type ProfileTab = 'posts' | 'reels' | 'tagged'

export const api = {
  // ----- session, onboarding, settings -----
  session: () => get<Session>('/session'),
  health: () => get<Health>('/health'),
  avatars: () => get<string[]>('/avatars'),
  onboard: (body: OnboardingRequest) => post<Session>('/onboarding', body),
  /** POST /api/onboarding/plan: what the user said about their world -> a plan to review (can take ~30 s). */
  onboardingPlan: (body: WorldPlanRequest) => post<WorldPlan>('/onboarding/plan', body),
  updateMe: (body: UpdateMeRequest) => patch<Me>('/me', body),
  settings: () => get<Settings>('/settings'),
  updateSettings: (body: UpdateSettingsRequest) => patch<Settings>('/settings', body),
  reset: () => post<Ok>('/reset'),
  badges: () => get<Badges>('/badges'),
  upload,
  /** POST /api/auth/logout: ends this device's session (signing in is a page visit to /auth/google). */
  logout: () => post<Ok>('/auth/logout'),

  // ----- feed, posts, explore, reels -----
  feed: (cursor?: string | null) => get<Page<Post>>(`/feed${query({ cursor })}`),
  explore: (cursor?: string | null, topic?: string | null) => get<Page<Post>>(`/explore${query({ cursor, topic })}`),
  reels: (cursor?: string | null, start?: ID | null) => get<Page<Post>>(`/reels${query({ cursor, start })}`),
  tag: (tag: string, cursor?: string | null) => get<Page<Post>>(`/tags/${enc(tag)}${query({ cursor })}`),
  saved: (cursor?: string | null) => get<Page<Post>>(`/saved${query({ cursor })}`),
  post: (id: ID) => get<Post>(`/posts/${enc(id)}`),
  createPost: (body: CreatePostRequest) => post<Post>('/posts', body),
  deletePost: (id: ID) => del<Ok>(`/posts/${enc(id)}`),
  likePost: (id: ID) => post<LikeResponse>(`/posts/${enc(id)}/like`),
  unlikePost: (id: ID) => del<LikeResponse>(`/posts/${enc(id)}/like`),
  savePost: (id: ID) => post<SaveResponse>(`/posts/${enc(id)}/save`),
  unsavePost: (id: ID) => del<SaveResponse>(`/posts/${enc(id)}/save`),
  viewPost: (id: ID) => post<ViewResponse>(`/posts/${enc(id)}/view`),
  sharePost: (id: ID, body: ShareRequest) => post<Ok>(`/posts/${enc(id)}/share`, body),
  postLikes: (id: ID) => get<LikesResponse>(`/posts/${enc(id)}/likes`),

  // ----- comments -----
  comments: (postId: ID) => get<Comment[]>(`/posts/${enc(postId)}/comments`),
  createComment: (postId: ID, body: CreateCommentRequest) => post<Comment>(`/posts/${enc(postId)}/comments`, body),
  likeComment: (id: ID) => post<CommentLikeResponse>(`/comments/${enc(id)}/like`),
  unlikeComment: (id: ID) => del<CommentLikeResponse>(`/comments/${enc(id)}/like`),
  pinComment: (id: ID) => post<{ pinned: boolean }>(`/comments/${enc(id)}/pin`),
  deleteComment: (id: ID) => del<Ok>(`/comments/${enc(id)}`),

  // ----- stories -----
  stories: () => get<StoryTray[]>('/stories'),
  userStories: (username: string) => get<StoryTray>(`/stories/user/${enc(username)}`),
  highlight: (id: ID) => get<Story[]>(`/highlights/${enc(id)}`),
  createStory: (body: CreateStoryRequest) => post<Story>('/stories', body),
  markStorySeen: (id: ID) => post<Ok>(`/stories/${enc(id)}/seen`),
  storyViewers: (id: ID) => get<ViewersResponse>(`/stories/${enc(id)}/viewers`),
  replyToStory: (id: ID, text: string) => post<StoryReplyResponse>(`/stories/${enc(id)}/reply`, { text }),
  reactToStory: (id: ID, emoji: string) => post<Ok>(`/stories/${enc(id)}/react`, { emoji }),
  deleteStory: (id: ID) => del<Ok>(`/stories/${enc(id)}`),

  // ----- accounts and search -----
  profile: (username: string) => get<Profile>(`/accounts/${enc(username)}`),
  profilePosts: (username: string, tab: ProfileTab = 'posts', cursor?: string | null) =>
    get<Page<Post>>(`/accounts/${enc(username)}/posts${query({ tab, cursor })}`),
  followers: (username: string, cursor?: string | null, q?: string | null) =>
    get<FollowListResponse>(`/accounts/${enc(username)}/followers${query({ cursor, q })}`),
  following: (username: string, cursor?: string | null, q?: string | null) =>
    get<FollowListResponse>(`/accounts/${enc(username)}/following${query({ cursor, q })}`),
  follow: (accountId: ID) => post<Account>(`/accounts/${enc(accountId)}/follow`),
  unfollow: (accountId: ID) => del<Account>(`/accounts/${enc(accountId)}/follow`),
  suggestions: () => get<Account[]>('/suggestions'),
  search: (q: string) => get<SearchResult>(`/search${query({ q })}`),

  // ----- notifications -----
  notifications: (cursor?: string | null) => get<Page<Notification>>(`/notifications${query({ cursor })}`),
  readNotifications: () => post<Badges>('/notifications/read'),

  // ----- messages -----
  conversations: () => get<ConversationsResponse>('/conversations'),
  createConversation: (body: CreateConversationRequest) => post<Conversation>('/conversations', body),
  conversation: (id: ID) => get<Conversation>(`/conversations/${enc(id)}`),
  updateConversation: (id: ID, body: UpdateConversationRequest) => patch<Conversation>(`/conversations/${enc(id)}`, body),
  acceptConversation: (id: ID) => post<Conversation>(`/conversations/${enc(id)}/accept`),
  deleteConversation: (id: ID) => del<Ok>(`/conversations/${enc(id)}`),
  messages: (conversationId: ID, cursor?: string | null) =>
    get<Page<Message>>(`/conversations/${enc(conversationId)}/messages${query({ cursor })}`),
  sendMessage: (conversationId: ID, body: SendMessageRequest) =>
    post<Message>(`/conversations/${enc(conversationId)}/messages`, body),
  readConversation: (conversationId: ID) => post<Badges>(`/conversations/${enc(conversationId)}/read`),
  reactToMessage: (messageId: ID, emoji: string | null) => post<Reaction[]>(`/messages/${enc(messageId)}/react`, { emoji }),

  // ----- recommendations -----
  /** POST /api/events: what the user looked at, in batches (lib/track.ts collects and sends them). */
  track: (body: TrackRequest) => post<{ ok: true; accepted: number }>('/events', body),
}
