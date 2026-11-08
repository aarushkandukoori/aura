import Foundation

/// Live events: merges every event from the server's stream into the store, so screens update
/// without refreshing (likes ticking up, comments arriving, DMs, typing, banners...).
extension AppStore {
    func handle(_ event: LiveEvent) {
        switch event {
        case .hello(let fresh):
            if let fresh { badges = fresh }
            // After a dropped connection, catch up on anything we missed.
            if wasDisconnected {
                wasDisconnected = false
                Task { await loadInitialData() }
            }

        case .notification(let notification, let fresh):
            notifications.removeAll { $0.id == notification.id }
            notifications.insert(notification, at: 0) // merged notifications move to the top
            if let fresh { badges = fresh }

        case .postNew(let post):
            remember(post)
            if !newPostIds.contains(post.id) { newPostIds.insert(post.id, at: 0) }

        case .postStats(let stats):
            guard var post = posts[stats.postId] else { return }
            post.likeCount = stats.likeCount
            post.commentCount = stats.commentCount
            post.viewCount = stats.viewCount
            post.shareCount = stats.shareCount
            if let likedBy = stats.likedBy { post.likedBy = likedBy }
            posts[stats.postId] = post

        case .postDeleted(let postId):
            forgetPost(postId)

        case .commentNew(let comment):
            insertComment(comment)
            showInPreview(comment)

        case .commentStats(let stats):
            updateComment(stats.commentId, in: stats.postId) {
                $0.likeCount = stats.likeCount
                $0.likedByAuthor = stats.likedByAuthor
            }

        case .commentDeleted(let postId, let commentId):
            removeCommentLocally(commentId, postId: postId) // the new count arrives as post.stats

        case .storyDeleted(let storyId, let authorId):
            removeStoryLocally(storyId, authorId: authorId)

        case .storyNew(let story):
            insertStory(story)

        case .storyViews(let storyId, let viewCount):
            for trayIndex in storyTrays.indices {
                if let storyIndex = storyTrays[trayIndex].stories.firstIndex(where: { $0.id == storyId }) {
                    storyTrays[trayIndex].stories[storyIndex].viewCount = viewCount
                }
            }

        case .messageNew(let message, let conversation, let fresh):
            upsertConversation(conversation)
            if message.isMine {
                mergeMyMessage(message)
            } else if messages[message.conversationId] != nil {
                appendMessage(message)
            }
            if let fresh { badges = fresh }
            // The chat is open: it's read the moment it arrives.
            if conversation.id == activeConversationId, !message.isMine {
                Task { await markConversationRead(conversation.id) }
            }

        case .messageReactions(let conversationId, let messageId, let reactions):
            updateMessage(messageId, in: conversationId) { $0.reactions = reactions }

        case .typing(let conversationId, let accountId, let isTyping):
            updateConversationLocally(conversationId) { conversation in
                conversation.typing.removeAll { $0 == accountId }
                if isTyping { conversation.typing.append(accountId) }
            }

        case .conversationUpdated(let conversation, let fresh):
            upsertConversation(conversation)
            if let fresh { badges = fresh }

        case .conversationDeleted(let conversationId):
            removeConversationLocally(conversationId)

        case .badges(let fresh):
            badges = fresh

        case .meStats(let stats):
            me?.followers = stats.followers
            me?.following = stats.following
            me?.postCount = stats.postCount
            me?.aura = stats.aura
            if let verified = stats.verified { me?.verified = verified }
            if let tier = stats.tier {
                me?.tier = tier
                settings?.tier = tier
            }

        case .accountUpdated(let account):
            accountUpdates[account.id] = account
            if account.isMe {
                me?.hasStory = account.hasStory
                me?.storySeen = account.storySeen
            }

        case .milestone(let milestone):
            self.milestone = milestone
            Haptics.success()

        case .banner(let banner):
            showBanner(banner)

        case .reset:
            handleReset()

        case .unknown:
            break // an event this version of the app doesn't know yet
        }
    }

    func connectionChanged(_ connected: Bool) {
        isLive = connected
        if !connected { wasDisconnected = true }
    }

    /// Keeps the two comments under a post in the feed fresh as new top-level comments arrive.
    private func showInPreview(_ comment: Comment) {
        guard comment.parentId == nil, var post = posts[comment.postId],
              !post.previewComments.contains(where: { $0.id == comment.id }) else { return }
        post.previewComments = Array((post.previewComments + [comment]).suffix(2))
        posts[comment.postId] = post
    }
}
