/**
 * server/repo - the data layer. Everything that reads or changes the world goes through here.
 *
 * API routes and the simulation both import from this one file. World actions write the
 * database, create notifications when the user is affected, and broadcast the live events the
 * apps need, so callers never write SQL for core objects or broadcast by hand.
 * Actions that write the database do nothing (or return null) when their target doesn't exist,
 * so a sim job left over from before "Start over" can't crash anything.
 */

// ----- session and settings -------------------------------------------------------------------
export {
  /** true once onboarding built the world. */
  isOnboarded,
  /** Settings DTO (tier, speed, model, provider line). */
  getSettings,
  /** Session DTO: onboarded, me, settings, badges. Works before onboarding. */
  getSession,
  /** Change tier / speed / model; a tier change moves my follower count. */
  updateSettings,
  /** true for tiers that get the verified badge (influencer, icon). */
  isVerifiedTier,
  /** Wipe everything and broadcast { type: 'reset' } (call sim.stop/start around it). */
  resetWorld,
} from './session.ts'

// ----- accounts and people --------------------------------------------------------------------
export {
  /** "Active now" lasts this long after touchActive(). */
  ACTIVE_WINDOW_MS,
  /** Raw account row by id. */
  getAccountRow,
  /** Raw account row by username (case-insensitive, leading @ allowed). */
  getAccountByUsername,
  /** The user's raw row (undefined before onboarding). */
  getMeRow,
  /** Account DTO by id, or null. */
  getAccount,
  /** Account rows -> Account DTOs (story rings in one bulk query). */
  toAccounts,
  /** One account row -> Account DTO. */
  toAccount,
  /** Account DTOs by id as a Map (2 queries for any number of ids). */
  accountsByIds,
  /** Broadcast account.updated for one account. */
  broadcastAccount,
  /** Every cast member with parsed persona, closest first. */
  getCast,
  /** One cast member with parsed persona, or null. */
  getCastMember,
  /** World action: mark someone active now (broadcasts when "Active now" appears). */
  touchActive,
  /** World action: move a cast member's closeness (0..1) up or down. */
  bumpCloseness,
  /** Random crowd ids; followingMe true/false narrows to my followers / non-followers. */
  randomCrowdIds,
  /** Search accounts by username or name (me, cast, crowd; max 30). */
  searchAccounts,
  /** "Suggested for you": unfollowed cast (creators/mutuals first), topped up with my followers. */
  getSuggestions,
} from './accounts.ts'
export type { CastMember, Persona } from './accounts.ts'

export {
  /** Does account a follow account b? (stable for non-user pairs). */
  follows,
  /** Followers / following page for any account (30 per page, optional filter). */
  followList,
  /** Accounts I follow that follow this account (up to 3 + count). */
  mutualsOf,
} from './graph.ts'

export {
  /** The user's Me DTO, or null before onboarding. */
  getMe,
  /** Profile DTO by username (mine comes back as Me). */
  getProfile,
  /** Edit my profile fields; broadcasts account.updated. */
  updateMe,
} from './profiles.ts'

export {
  /** Released post count for an account. */
  countPosts,
  /** Broadcast me.stats (followers, following, postCount, aura, verified, tier). */
  broadcastMeStats,
  /** The user follows / unfollows an account; broadcasts account.updated + me.stats. */
  setFollow,
  /** World action: named + crowd followers (named ones already following are skipped); merged follow notification, milestones, me.stats. */
  addFollowers,
  /** World action: one named account follows me back. */
  followBack,
  /** World action: change my aura score; broadcasts me.stats. */
  bumpAura,
  /** Group key that merges today's follows into one notification. */
  followGroupKey,
} from './followers.ts'

export {
  /** Disk path behind a /content/... or /media/uploads/... URL (null otherwise). */
  mediaFilePath,
} from './files.ts'

export {
  /** Interest matching with related words ("fitness" ~ "powerlifting"). */
  matchesInterest,
  /** How many of these interests a text touches. */
  interestScore,
  /** Emoji for an interest group chat. */
  interestEmoji,
} from './interests.ts'

// ----- notifications --------------------------------------------------------------------------
export {
  /** Badge counts: unread notifications, chats with unread messages. */
  getBadges,
  /** World action: add or merge (groupKey) a notification for the user; broadcasts it. Null if the user, actor or post is gone. */
  pushNotification,
  /** The unread notification a groupKey would merge into. */
  unreadGroup,
  /** Notifications page, newest first (40). */
  listNotifications,
  /** Mark every notification read; broadcasts and returns badges. */
  markAllNotificationsRead,
  /** World action: broadcast a milestone celebration (title, body). */
  celebrate,
  /** World action: broadcast a push-style banner ({ title, body, avatar?, href? }). */
  showBanner,
} from './notifications.ts'
export type { NewNotification } from './notifications.ts'

// ----- posts and feeds ------------------------------------------------------------------------
export {
  /** Raw post row by id (any, including library posts). */
  getPostRow,
  /** Raw post row only if released. */
  getVisiblePostRow,
  /** Post DTO (released only), or null. */
  getPost,
  /** Broadcast post.stats for a post. */
  broadcastPostStats,
  /** The user publishes a post; broadcasts post.new + me.stats. */
  createPost,
  /** Delete a post; broadcasts post.deleted + me.stats. */
  deletePost,
  /** The user likes / unlikes a post; broadcasts post.stats. */
  setPostLike,
  /** The user saves / unsaves a post. */
  setPostSave,
  /** Count a reel view (+ a little crowd on cast reels); broadcasts post.stats. */
  addPostView,
  /** +1 share_count; broadcasts post.stats. */
  countShare,
  /** "Liked by" list (named first, filled with stable crowd up to 50). */
  getLikers,
  /** World action: named + crowd likes; merged like notification on my posts; post.stats. */
  addPostLikes,
  /** World action: many reel views at once (strangers watching); post.stats. */
  addPostViews,
  /** World action: a library post goes live now; broadcasts post.new. */
  releasePost,
  /** World action: store what a post's picture shows (posts.ai_note). */
  setPostNote,
  /** Library posts not released yet (optionally one author's). */
  getLibraryPosts,
} from './posts.ts'
export type { NewPost } from './posts.ts'

export {
  /** Home feed page with suggested posts mixed in. */
  getFeed,
  /** Explore page, ranked; optional topic filter. */
  getExplore,
  /** Reels page; `start` puts one reel first. */
  getReels,
  /** Posts with #tag. */
  getTagPosts,
  /** Posts I saved. */
  getSaved,
  /** Profile grid: posts / reels / tagged. */
  getProfilePosts,
  /** Hashtags starting with a query, with post counts. */
  searchTags,
} from './feeds.ts'
export type { ProfileTab } from './feeds.ts'

// ----- comments -------------------------------------------------------------------------------
export {
  /** Raw comment row by id. */
  getCommentRow,
  /** Threaded comments of a post (pinned, mine, oldest; replies nested). */
  getComments,
  /** World action: add a comment or reply by anyone; notifications + comment.new + post.stats. */
  addComment,
  /** World action: someone likes a comment (byAuthor = post author's heart); comment.stats. */
  likeComment,
  /** The user hearts / un-hearts a comment. */
  setMyCommentLike,
  /** Pin / unpin a top-level comment on my post (null if not allowed). */
  togglePin,
  /** May the user delete this comment? */
  canDeleteComment,
  /** Delete a comment and its replies; comment.deleted + post.stats. */
  deleteComment,
} from './comments.ts'
export type { NewComment } from './comments.ts'

// ----- stories --------------------------------------------------------------------------------
export {
  /** Raw story row by id. */
  getStoryRow,
  /** Home story trays (mine, unseen, seen). */
  getStoryTrays,
  /** One account's active stories by username, or null. */
  getUserTray,
  /** Stories of a highlight (ignores expiry), or null. */
  getHighlightStories,
  /** The user posts a story; broadcasts story.new + account.updated. */
  createStory,
  /** Mark a story seen by me. */
  markStorySeen,
  /** Viewers of a story with reactions. */
  getViewers,
  /** Delete one of my stories; story.deleted. */
  deleteStory,
  /** World action: a library story goes live for 24 h; story.new + account.updated. */
  releaseStory,
  /** World action: named + crowd views on a story; story.views. */
  addStoryViews,
  /** World action: emoji reaction on a story; story_reaction notification on mine. */
  reactToStory,
  /** Library stories not released yet (optionally one author's). */
  getLibraryStories,
  /** World action: expired cast stories go back to the library (highlight copies stay). */
  recycleStories,
} from './stories.ts'

// ----- conversations and messages -------------------------------------------------------------
export {
  /** Raw conversation row by id. */
  getConversationRow,
  /** Member ids of a conversation row (never 'me'). */
  memberIds,
  /** Conversation DTO by id, or null. */
  getConversation,
  /** Every conversation (requests included), newest first. */
  listConversations,
  /** Inbox: conversations + requests. */
  getInbox,
  /** Broadcast conversation.updated for one conversation. */
  broadcastConversation,
  /** World action: the DM with an account, created if needed (no broadcast). */
  getOrCreateDm,
  /** World action: a new group chat (no broadcast; the first message does it). Null if no member exists. */
  createGroup,
  /** Rename / emoji / mute; broadcasts conversation.updated. */
  updateConversation,
  /** Accept a message request. */
  acceptRequest,
  /** Delete a conversation and its messages; conversation.deleted + badges. */
  deleteConversation,
  /** World action: the other side read my messages (seen_at = now). */
  markSeen,
  /** I read a conversation: unread = 0; broadcasts and returns badges. */
  markRead,
} from './conversations.ts'
export type { NewGroup } from './conversations.ts'

export {
  /** Raw message row by id. */
  getMessageRow,
  /** Chat page: 40 messages oldest -> newest, cursor loads older. */
  getMessagesPage,
  /** Last N messages of a chat, oldest first (AI context). */
  getMessages,
  /** The user sends a message; broadcasts message.new. */
  sendMyMessage,
  /** World action: a character sends a message; clears typing, unread+1, message.new + banner. */
  sendCastMessage,
  /** World action: set / remove an emoji reaction on a message; message.reactions. */
  reactToMessage,
} from './messages.ts'
export type { CastMessage } from './messages.ts'

export {
  /** World action: show / hide "typing..." (in memory, auto-clears after 12 s). */
  setTyping,
  /** Who is typing in a conversation right now. */
  typingIn,
} from './typing.ts'

// ----- memories -------------------------------------------------------------------------------
export {
  /** World action: remember a fact about the user ('*' = whole cast). */
  addMemory,
  /** A character's newest memories (own + '*'). */
  getMemories,
} from './memories.ts'

// ----- DTO mappers ----------------------------------------------------------------------------
export {
  /** Parsed Media[] of a post row. */
  postMedia,
  /** Thumbnail URL of a post row (video poster for videos). */
  postThumb,
  /** The "Liked by" account of a post. */
  bestLiker,
  /** Post rows -> Post DTOs (bulk). */
  toPosts,
  /** One post row -> Post DTO. */
  toPost,
  /** Comment rows -> Comment DTOs (bulk, replies empty). */
  toComments,
  /** Story rows -> Story DTOs (bulk). */
  toStories,
  /** Still image of a story row. */
  storyThumb,
  /** Notification rows -> Notification DTOs (bulk). */
  toNotifications,
  /** Message rows -> Message DTOs (bulk). */
  toMessages,
  /** Conversation rows -> Conversation DTOs (bulk). */
  toConversations,
  /** "Maya, Diego, Priya +1" title for unnamed groups. */
  defaultGroupTitle,
} from './dto.ts'

export type {
  AccountRow, CommentRow, ConversationRow, MessageRow, NotificationRow, PostRow, StoryRow,
} from './rows.ts'
