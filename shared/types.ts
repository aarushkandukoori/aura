/**
 * Aura API contract.
 *
 * The server sends these shapes as JSON. The web app imports this file directly, and the iOS app
 * mirrors it in Swift (ios/Aura/Core/Models.swift). If you change a shape here, change both sides.
 *
 * Conventions
 * - ids are strings ("p_3kX9aQ", "maya", "me", "u0412").
 * - times are milliseconds since 1970 (what Date.now() returns).
 * - media URLs are root-relative: "/content/images/maya/p1.webp" (AI-generated library)
 *   or "/media/uploads/abc.jpg" (things the user uploaded).
 * - every list endpoint that can grow returns Page<T> with an opaque nextCursor.
 */

export type ID = string
export type Millis = number

/** How popular the user is. Scales follower counts and how much engagement each post gets. */
export type Tier = 'rising' | 'popular' | 'influencer' | 'icon'
/** How fast the simulated world moves. "fast" squeezes an hour of reactions into a few minutes. */
export type Speed = 'realtime' | 'fast' | 'instant'
/** Which Claude model writes comments, DMs and group chats. */
export type AiModel = 'opus' | 'sonnet' | 'haiku'
/** The part an AI character plays in the user's life. */
export type Role = 'bestie' | 'friend' | 'mutual' | 'fan' | 'creator'
/** me = the human, cast = named AI characters with personalities, crowd = background followers. */
export type AccountKind = 'me' | 'cast' | 'crowd'

export interface Media {
  url: string
  type: 'image' | 'video'
  width?: number | null
  height?: number | null
  /** Videos only: a still frame (uploaded image URL) used for grid thumbnails and for the AI to "see" the video. */
  poster?: string | null
}

/** Small account summary used everywhere (post headers, comment authors, lists, chat members). */
export interface Account {
  id: ID
  kind: AccountKind
  username: string
  displayName: string
  avatar: string | null
  verified: boolean
  role: Role | null
  followsMe: boolean
  iFollow: boolean
  hasStory: boolean          // has at least one unexpired story
  storySeen: boolean         // I have seen all of their current stories
  lastActiveAt: Millis | null // show "Active now" when within the last 5 minutes
}

/** A full profile page. */
export interface Profile extends Account {
  bio: string
  pronouns: string
  location: string | null
  occupation: string | null
  followers: number
  following: number
  postCount: number
  mutuals: Account[]         // up to 3, for "Followed by maya.chen, dev.k and 12 others"
  mutualCount: number
  isMe: boolean
  highlights: Highlight[]
}

export interface Highlight {
  id: ID
  title: string
  cover: string
  storyIds: ID[]
}

/** The human using the app. */
export interface Me extends Profile {
  tier: Tier
  interests: string[]
  aura: number               // playful score that climbs as people engage with you
}

export interface Post {
  id: ID
  author: Account
  kind: 'photo' | 'carousel' | 'reel'
  /**
   * photo: 1 image. carousel: 2-10 images.
   * reel: one video (user uploads) OR several images (AI reels: play them full-screen with a slow
   * zoom/pan and a cross-fade, like a photo-mode reel).
   */
  media: Media[]
  caption: string
  location: string | null
  tagged: Account[]
  audio: string | null       // reels: e.g. "original audio · maya.chen"
  likeCount: number
  commentCount: number
  viewCount: number          // reels only
  shareCount: number
  likedByMe: boolean
  savedByMe: boolean
  likedBy: Account | null    // best-known liker for "Liked by maya.chen and 1,203 others"
  previewComments: Comment[] // up to 2, shown under the post in the feed (no replies)
  createdAt: Millis
  suggested: boolean         // feed only: render a "Suggested for you" label
  /** Why the algorithm picked it, e.g. "Because you like #coffee" (suggested posts only). */
  reason?: string | null
}

export interface Comment {
  id: ID
  postId: ID
  author: Account
  text: string
  parentId: ID | null        // set on replies
  likeCount: number
  likedByMe: boolean
  likedByAuthor: boolean     // the post's author hearted this comment
  pinned: boolean
  createdAt: Millis
  replies: Comment[]         // filled only on top-level comments from GET /api/posts/:id/comments
}

export interface StoryOverlay {
  text?: string | null
  color?: string | null      // text color, e.g. "#ffffff"
  background?: string | null // text pill background, e.g. "rgba(0,0,0,0.45)" or null for none
  y?: number | null          // 0..1 vertical position of the text (0.5 = middle)
}

export interface Story {
  id: ID
  author: Account
  media: Media
  overlay: StoryOverlay | null
  createdAt: Millis
  expiresAt: Millis
  seen: boolean
  viewCount: number          // only meaningful on my own stories
}

export interface StoryTray {
  author: Account
  stories: Story[]           // oldest first
  allSeen: boolean
  latestAt: Millis
}

export type NotificationKind =
  | 'like'           // liked your post (merged: actor + others)
  | 'comment'        // commented on your post
  | 'reply'          // replied to your comment
  | 'mention'        // mentioned you in a comment
  | 'comment_like'   // liked your comment
  | 'follow'         // started following you (merged: actor + others)
  | 'story_reaction' // reacted to your story (text = emoji)
  | 'tag'            // tagged you in a post
  | 'milestone'      // "You hit 50K followers" (actor null)

export interface Notification {
  id: ID
  kind: NotificationKind
  actor: Account | null
  others: number             // "and 1,203 others"
  postId: ID | null
  postThumb: string | null
  commentId: ID | null
  text: string | null        // comment text, reaction emoji, or milestone message
  createdAt: Millis
  read: boolean
}

export interface Reaction {
  accountId: ID
  emoji: string
}

export interface Message {
  id: ID
  conversationId: ID
  sender: Account            // sender.kind === 'me' for my own messages
  text: string
  media: Media | null
  sharedPost: Post | null    // a post sent into the chat
  story: { id: ID; thumb: string } | null // this message replies to a story
  replyTo: { id: ID; text: string; senderName: string } | null
  reactions: Reaction[]
  createdAt: Millis
}

export interface Conversation {
  id: ID
  kind: 'dm' | 'group'
  title: string              // DM: the other person's display name. Group: the group name.
  emoji: string | null       // group icon (DMs use the member's avatar)
  members: Account[]         // everyone except me
  isRequest: boolean         // a message request from someone I don't follow
  muted: boolean
  unread: number
  lastMessage: Message | null
  lastMessageAt: Millis
  typing: ID[]               // ids of members typing right now
  seenAt: Millis | null      // DMs: when the other person last read my messages
}

export interface ProviderInfo {
  active: 'anthropic' | 'openai' | 'claude-cli' | 'offline'
  detail: string             // human readable, e.g. "Claude Code login · claude-opus-5-5"
}

export interface Settings {
  tier: Tier
  speed: Speed
  model: AiModel
  provider: ProviderInfo
  /** Models this server lets people pick (a public server may allow only the cheap one). */
  models?: AiModel[]
}

export interface Badges {
  notifications: number      // unread notifications
  messages: number           // conversations with unread messages (requests excluded)
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

/** GET /api/session - the first call every client makes. */
export interface Session {
  /** true when the server has Google sign-in set up. false = local mode: no sign-in, one world. */
  authEnabled: boolean
  /** The signed-in Google account, or null (signed out, or local mode). */
  account: SignedInAccount | null
  onboarded: boolean
  me: Me | null
  settings: Settings
  badges: Badges
}

/** The Google account behind a session. Each account has its own separate Aura world. */
export interface SignedInAccount {
  id: ID
  email: string
  name: string
  picture: string | null
}

export interface Health {
  ok: true
  onboarded: boolean
  provider: ProviderInfo
  castCount: number
  imagesReady: number
  imagesTotal: number
}

// ---------------------------------------------------------------------------------------------
// Request / response bodies
// ---------------------------------------------------------------------------------------------

export interface OnboardingRequest {
  displayName: string
  username: string
  avatar: string | null      // URL from POST /api/upload or one of GET /api/avatars, or null
  bio: string
  pronouns: string
  interests: string[]        // e.g. ["music", "food", "fitness"]
  tier: Tier
  origin: string             // how you know your friends: "college" | "high school" | "work" | "online" | "hometown"
  /** The plan from POST /api/onboarding/plan, if the user described their world. Shapes the cast and chats. */
  plan?: WorldPlan | null
}

/**
 * POST /api/onboarding/plan. During sign-up the user talks (speech to text on their device) or types
 * for up to a minute about the world they want: who their friends are, what they're into, how
 * popular they want to be. The AI turns that into a WorldPlan the user can review before building.
 */
export interface WorldPlanRequest {
  transcript: string          // what they said or typed (the server keeps the first ~3,000 characters)
  displayName?: string | null // from their Google account, when known
}

export interface WorldPlan {
  displayName: string
  username: string            // a suggestion; the user can change it
  bio: string
  pronouns: string
  interests: string[]
  origin: string              // how they know their friends, in their words ("the robotics club at college")
  tier: Tier                  // read from how popular they said they want to be ("popular" when unclear)
  summary: string             // one or two warm sentences describing the world we're about to build
  /** Cast members chosen as their people, with the relationship rewritten around what they said. */
  friends: { id: ID; role: Role; relationship: string; account: Account | null }[]
  /** Group chats to create, made of chosen cast members. */
  groupChats: { title: string; emoji: string; vibe: string; memberIds: ID[] }[]
  /** People they described whom no cast member fits; created as new characters in the background. */
  newFriends: { name: string; description: string; role: Role }[]
  /** Facts about the user that every character knows from the start. */
  memories: string[]
}

/**
 * POST /api/events. What the user looked at and for how long; the recommendation algorithm learns
 * from these (likes, comments, saves, shares and follows are already known from their own endpoints).
 * Clients collect events and send them in batches (every ~10 s and when the app goes to background).
 */
export type TrackEventType =
  | 'impression'   // a post was at least half on screen for 1 s or more (ms = how long)
  | 'open'         // opened a post's detail view or comments
  | 'profile_view' // opened someone's profile (accountId)
  | 'reel_watch'   // watched a reel (ms = time watched, complete = reached the end at least once)
  | 'story_view'   // looked at a story (ms = time on screen)
  | 'story_skip'   // tapped past a story within 1.5 s
  | 'search'       // searched (query)
  | 'tag_open'     // opened a hashtag page (tag)

export interface TrackEvent {
  type: TrackEventType
  postId?: ID | null
  accountId?: ID | null
  storyId?: ID | null
  ms?: number | null
  complete?: boolean | null
  query?: string | null
  tag?: string | null
  at: Millis
}

export interface TrackRequest {
  events: TrackEvent[]
}

export interface UpdateMeRequest {
  displayName?: string
  username?: string
  avatar?: string | null
  bio?: string
  pronouns?: string
  interests?: string[]
}

export interface UpdateSettingsRequest {
  tier?: Tier
  speed?: Speed
  model?: AiModel
}

export interface UploadResponse {
  url: string
  type: 'image' | 'video'
  width: number | null
  height: number | null
}

export interface CreatePostRequest {
  kind: 'photo' | 'carousel' | 'reel'
  media: Media[]
  caption: string
  location?: string | null
  taggedIds?: ID[]
}

export interface LikeResponse { likeCount: number; likedByMe: boolean }
export interface SaveResponse { savedByMe: boolean }
export interface ViewResponse { viewCount: number }
export interface ShareRequest { conversationIds: ID[]; text?: string | null }
export interface LikesResponse { accounts: Account[]; total: number }

export interface CreateCommentRequest {
  text: string
  parentId?: ID | null       // reply to this top-level comment
}
export interface CommentLikeResponse { likeCount: number; likedByMe: boolean }

export interface CreateStoryRequest {
  media: Media
  overlay?: StoryOverlay | null
}
export interface StoryReplyRequest { text: string }
export interface StoryReplyResponse { conversationId: ID }
export interface StoryReactRequest { emoji: string }
export interface ViewersResponse {
  viewers: { account: Account; reaction: string | null }[]
  total: number              // total views (named viewers + crowd)
}

export interface FollowListResponse {
  accounts: Account[]
  total: number
  nextCursor: string | null
}

export interface SearchResult {
  accounts: Account[]
  tags: { tag: string; postCount: number }[]
}

export interface ConversationsResponse {
  conversations: Conversation[]  // newest activity first, requests excluded
  requests: Conversation[]
}
export interface CreateConversationRequest {
  memberIds: ID[]            // one id = DM (returns the existing DM if there is one); 2+ = group
  title?: string | null
}
export interface UpdateConversationRequest {
  title?: string
  emoji?: string | null
  muted?: boolean
}
export interface SendMessageRequest {
  text?: string
  media?: Media | null
  sharedPostId?: ID | null
  replyToId?: ID | null
}
export interface ReactRequest {
  emoji: string | null       // null removes my reaction
}

// ---------------------------------------------------------------------------------------------
// Live events: GET /api/live is a Server-Sent Events stream. Each event is `data: <LiveEvent JSON>`.
// Clients merge these into what they already show, so the app feels alive without refreshing.
// ---------------------------------------------------------------------------------------------

export type LiveEvent =
  | { type: 'hello'; serverTime: Millis; badges: Badges }
  /** Insert, or replace by id (merged "like" notifications are updated in place and move to the top). */
  | { type: 'notification'; notification: Notification; badges: Badges }
  /** A new post went live (a cast member posted, or one of mine). */
  | { type: 'post.new'; post: Post }
  | { type: 'post.stats'; postId: ID; likeCount: number; commentCount: number; viewCount: number; shareCount: number; likedBy: Account | null }
  | { type: 'post.deleted'; postId: ID }
  /** comment.parentId is set for replies. */
  | { type: 'comment.new'; comment: Comment }
  | { type: 'comment.stats'; postId: ID; commentId: ID; likeCount: number; likedByAuthor: boolean }
  /** A comment was deleted (its replies go with it). */
  | { type: 'comment.deleted'; postId: ID; commentId: ID }
  | { type: 'story.new'; story: Story }
  | { type: 'story.views'; storyId: ID; viewCount: number }
  | { type: 'story.deleted'; storyId: ID; authorId: ID }
  | { type: 'message.new'; message: Message; conversation: Conversation; badges: Badges }
  | { type: 'message.reactions'; conversationId: ID; messageId: ID; reactions: Reaction[] }
  | { type: 'typing'; conversationId: ID; accountId: ID; typing: boolean }
  /** Seen receipts, unread counts, rename/mute, a request accepted, a new conversation. */
  | { type: 'conversation.updated'; conversation: Conversation; badges: Badges }
  | { type: 'conversation.deleted'; conversationId: ID }
  /** Unread counts changed, e.g. after notifications or a chat were marked read. */
  | { type: 'badges'; badges: Badges }
  /** verified and tier come along so a tier change (Settings) shows everywhere. */
  | { type: 'me.stats'; followers: number; following: number; postCount: number; aura: number; verified?: boolean; tier?: Tier }
  /** Follow state, story ring or "Active now" changed for someone. */
  | { type: 'account.updated'; account: Account }
  /** A big moment ("You just hit 50K followers"): show a celebration. */
  | { type: 'milestone'; title: string; body: string }
  /** A push-notification-style banner to slide in at the top. href is an in-app path like "/messages/c_123". */
  | { type: 'banner'; title: string; body: string; avatar: string | null; href: string | null }
  /** The world was reset (Settings > Start over). Clients should go back to onboarding. */
  | { type: 'reset' }
