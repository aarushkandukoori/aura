/**
 * Every kind of job the simulation schedules, and the function that runs it.
 * A job whose kind isn't listed here fails safely (the scheduler logs it and moves on).
 */
import { answerComment, reactToMyComment } from './comments.ts'
import { nudgeIfIgnored, replyInChat, sendDm, sendGroupLines } from './chats.ts'
import { commentOnCastPost, creatorNotice, likeCommentBy, likeWave, postComment, reactToNewPost } from './posts.ts'
import type { Handlers } from './scheduler.ts'
import { followedByUser, likedByUser } from './social.ts'
import { reactToNewStory, storyReaction, storyViewWave } from './stories.ts'
import { welcomeUser } from './welcome.ts'
import { catchUp, worldEvent, worldTick } from './world.ts'

export const HANDLERS: Handlers = {
  // the user's posts, and everyone's comments
  post_react: reactToNewPost,
  post_wave: likeWave,
  comment: postComment,
  comment_likes: likeCommentBy,
  creator_notice: creatorNotice,
  cast_post_comments: commentOnCastPost,
  // the user's stories
  story_react: reactToNewStory,
  story_views: storyViewWave,
  story_reaction: storyReaction,
  // the user's comments, follows and likes
  user_comment: reactToMyComment,
  comment_reply: answerComment,
  user_follow: followedByUser,
  user_liked: likedByUser,
  // chats
  cast_dm: sendDm,
  group_lines: sendGroupLines,
  chat_reply: replyInChat,
  read_nudge: nudgeIfIgnored,
  // the world on its own
  welcome: welcomeUser,
  world_tick: worldTick,
  world_event: worldEvent,
  catch_up: catchUp,
}

/**
 * Jobs timed in real seconds (chats, the world loop). Every other kind runs on sim time and moves
 * closer or further away when the speed setting changes.
 */
export const REAL_TIME_KINDS = ['chat_reply', 'read_nudge', 'comment_reply', 'welcome', 'world_tick', 'world_event', 'catch_up']
