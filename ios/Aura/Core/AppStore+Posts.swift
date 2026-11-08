import Foundation

/// Posts and comments: the shared post cache, likes, saves, shares and the comments of each post.
extension AppStore {
    // MARK: - Post cache

    /// Puts posts in the shared cache (replacing older copies). Call it with every page you load,
    /// then show `store.posts[id]` so live numbers appear everywhere.
    func remember(_ newPosts: [Post]) {
        for post in newPosts { posts[post.id] = post }
    }

    func remember(_ post: Post) {
        posts[post.id] = post
    }

    /// The freshest copy of a post, or nil if it isn't loaded or was deleted.
    func post(_ id: String) -> Post? {
        posts[id]
    }

    /// Loads one post into the cache (for a post page opened from a link or a notification).
    @discardableResult
    func loadPost(_ id: String) async throws -> Post {
        let post = try await API.post(id)
        remember(post)
        return post
    }

    /// HomeView calls this after it shows the new posts.
    func clearNewPosts() {
        newPostIds = []
    }

    // MARK: - Likes, saves, views, shares

    /// Like or unlike right away (with a haptic), then confirm with the server.
    func toggleLike(_ postId: String) {
        guard let post = posts[postId] else { return }
        setLiked(!post.likedByMe, postId: postId)
    }

    /// Double-tap to like: only ever likes, never unlikes.
    func like(_ postId: String) {
        guard let post = posts[postId] else { return }
        if post.likedByMe {
            Haptics.tap()
        } else {
            setLiked(true, postId: postId)
        }
    }

    private func setLiked(_ liked: Bool, postId: String) {
        guard var post = posts[postId] else { return }
        post.likedByMe = liked
        post.likeCount = max(0, post.likeCount + (liked ? 1 : -1))
        posts[postId] = post
        if liked { Haptics.like() } else { Haptics.tap() }
        Task {
            do {
                let result = liked ? try await API.likePost(postId) : try await API.unlikePost(postId)
                // Only apply the answer if the user hasn't tapped again since.
                if posts[postId]?.likedByMe == liked {
                    posts[postId]?.likeCount = result.likeCount
                    posts[postId]?.likedByMe = result.likedByMe
                }
            } catch {
                if posts[postId]?.likedByMe == liked {
                    posts[postId]?.likedByMe = !liked
                    posts[postId]?.likeCount += liked ? -1 : 1
                }
            }
        }
    }

    func toggleSave(_ postId: String) {
        guard let saved = posts[postId]?.savedByMe else { return }
        posts[postId]?.savedByMe = !saved
        Haptics.tap()
        Task {
            do {
                let result = saved ? try await API.unsavePost(postId) : try await API.savePost(postId)
                posts[postId]?.savedByMe = result.savedByMe
            } catch {
                posts[postId]?.savedByMe = saved
                showToast(error.localizedDescription)
            }
        }
    }

    /// Counts a reel view (ReelsView calls it after 2 seconds on screen).
    func recordView(_ postId: String) {
        Task {
            if let result = try? await API.viewPost(postId) {
                posts[postId]?.viewCount = result.viewCount
            }
        }
    }

    /// Sends a post into conversations (ShareSheetView). The messages arrive through the live stream.
    func share(postId: String, to conversationIds: [String], text: String? = nil) async throws {
        try await API.sharePost(postId, ShareRequest(conversationIds: conversationIds, text: text))
        posts[postId]?.shareCount += 1
        Haptics.success()
    }

    // MARK: - My posts

    /// Publishes a post. It goes into the cache and to the front of `newPostIds`.
    func createPost(_ request: CreatePostRequest) async throws -> Post {
        let post = try await API.createPost(request)
        remember(post)
        if !newPostIds.contains(post.id) { newPostIds.insert(post.id, at: 0) }
        return post
    }

    func deletePost(_ postId: String) async throws {
        try await API.deletePost(postId)
        forgetPost(postId)
    }

    /// Removes a deleted post from every cache.
    func forgetPost(_ postId: String) {
        posts[postId] = nil
        comments[postId] = nil
        newPostIds.removeAll { $0 == postId }
    }

    // MARK: - Comments

    /// Loads a post's comments into `comments[postId]`.
    func loadComments(for postId: String) async throws {
        comments[postId] = try await API.comments(postId: postId)
    }

    /// Posts a comment, or a reply when `parentId` is a top-level comment's id.
    @discardableResult
    func addComment(to postId: String, text: String, parentId: String? = nil) async throws -> Comment {
        let comment = try await API.addComment(postId: postId, CreateCommentRequest(text: text, parentId: parentId))
        insertComment(comment)
        // The server's post.stats event brings the exact number; this just updates it a moment sooner.
        posts[postId]?.commentCount += 1
        return comment
    }

    /// Adds a comment (or reply) to the loaded comments, skipping duplicates. Live events use it too.
    func insertComment(_ comment: Comment) {
        guard var list = comments[comment.postId] else { return }
        if let parentId = comment.parentId {
            guard let parent = list.firstIndex(where: { $0.id == parentId }),
                  !list[parent].replies.contains(where: { $0.id == comment.id }) else { return }
            list[parent].replies.append(comment)
        } else {
            guard !list.contains(where: { $0.id == comment.id }) else { return }
            list.append(comment)
        }
        comments[comment.postId] = list
    }

    /// Heart or un-heart a comment right away, then confirm with the server.
    func toggleCommentLike(_ comment: Comment) {
        let liked = !(findComment(comment.id, in: comment.postId)?.likedByMe ?? comment.likedByMe)
        updateComment(comment.id, in: comment.postId) {
            $0.likedByMe = liked
            $0.likeCount = max(0, $0.likeCount + (liked ? 1 : -1))
        }
        Haptics.tap()
        Task {
            do {
                let result = liked ? try await API.likeComment(comment.id) : try await API.unlikeComment(comment.id)
                updateComment(comment.id, in: comment.postId) {
                    $0.likeCount = result.likeCount
                    $0.likedByMe = result.likedByMe
                }
            } catch {
                updateComment(comment.id, in: comment.postId) {
                    $0.likedByMe = !liked
                    $0.likeCount = max(0, $0.likeCount + (liked ? -1 : 1))
                }
            }
        }
    }

    /// Pin or unpin a comment on my post. Pinned comments move to the top.
    func togglePin(_ comment: Comment) async throws {
        let result = try await API.pinComment(comment.id)
        updateComment(comment.id, in: comment.postId) { $0.pinned = result.pinned }
        try? await loadComments(for: comment.postId) // the server decides the new order
    }

    func deleteComment(_ comment: Comment) async throws {
        try await API.deleteComment(comment.id)
        removeCommentLocally(comment.id, postId: comment.postId)
        posts[comment.postId]?.commentCount -= 1 + comment.replies.count
    }

    /// Removes a comment (or reply) from the loaded thread and from the feed card's preview.
    /// Used after deleting here and when a `comment.deleted` event says it was deleted elsewhere.
    func removeCommentLocally(_ commentId: String, postId: String) {
        if var list = comments[postId] {
            list.removeAll { $0.id == commentId }
            for index in list.indices { list[index].replies.removeAll { $0.id == commentId } }
            comments[postId] = list
        }
        posts[postId]?.previewComments.removeAll { $0.id == commentId }
    }

    /// Finds a loaded comment or reply by id.
    func findComment(_ id: String, in postId: String) -> Comment? {
        for comment in comments[postId] ?? [] {
            if comment.id == id { return comment }
            if let reply = comment.replies.first(where: { $0.id == id }) { return reply }
        }
        return nil
    }

    /// Changes a loaded comment or reply in place.
    func updateComment(_ id: String, in postId: String, _ change: (inout Comment) -> Void) {
        guard var list = comments[postId] else { return }
        for index in list.indices {
            if list[index].id == id {
                change(&list[index])
            } else if let replyIndex = list[index].replies.firstIndex(where: { $0.id == id }) {
                change(&list[index].replies[replyIndex])
            }
        }
        comments[postId] = list
    }
}
