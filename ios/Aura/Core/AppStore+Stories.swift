import Foundation

/// Stories: the stories row, opening the viewer, seen state, and posting my own stories.
extension AppStore {
    /// My own tray, if I have active stories.
    var myTray: StoryTray? {
        storyTrays.first { $0.author.isMe }
    }

    func loadStories() async {
        if let trays = try? await API.stories() { storyTrays = trays }
    }

    // MARK: - Opening the viewer

    /// Opens the full-screen viewer at `startIndex`; it moves on through the following trays.
    func openStories(trays: [StoryTray], startIndex: Int = 0) {
        guard trays.indices.contains(startIndex) else { return }
        storyViewer = StoryViewerRequest(trays: trays, startIndex: startIndex)
    }

    /// Opens someone's stories (tapping a ringed avatar). Uses the stories row when they're in it,
    /// otherwise asks the server. Returns false when they have no active stories.
    @discardableResult
    func openStories(for account: Account) async -> Bool {
        if let index = storyTrays.firstIndex(where: { $0.author.id == account.id }) {
            openStories(trays: storyTrays, startIndex: index)
            return true
        }
        return await openStories(username: account.username)
    }

    @discardableResult
    func openStories(username: String) async -> Bool {
        if let index = storyTrays.firstIndex(where: { $0.author.username == username }) {
            openStories(trays: storyTrays, startIndex: index)
            return true
        }
        guard let tray = try? await API.userStories(username), !tray.stories.isEmpty else { return false }
        openStories(trays: [tray])
        return true
    }

    func closeStories() {
        storyViewer = nil
    }

    // MARK: - Seen state

    /// Call when a story has been shown. Updates the row and every story ring, then tells the server.
    func markStorySeen(_ story: Story) {
        if let trayIndex = storyTrays.firstIndex(where: { $0.author.id == story.author.id }),
           let storyIndex = storyTrays[trayIndex].stories.firstIndex(where: { $0.id == story.id }) {
            guard !storyTrays[trayIndex].stories[storyIndex].seen else { return } // already counted
            storyTrays[trayIndex].stories[storyIndex].seen = true
            let allSeen = storyTrays[trayIndex].stories.allSatisfy(\.seen)
            storyTrays[trayIndex].allSeen = allSeen
            if allSeen {
                var author = latest(storyTrays[trayIndex].author)
                author.storySeen = true
                accountUpdates[author.id] = author
            }
        } else if story.seen {
            return
        }
        Task { try? await API.markStorySeen(story.id) }
    }

    // MARK: - My stories

    func createStory(_ request: CreateStoryRequest) async throws -> Story {
        let story = try await API.createStory(request)
        insertStory(story)
        return story
    }

    func deleteStory(_ story: Story) async throws {
        try await API.deleteStory(story.id)
        removeStoryLocally(story.id, authorId: story.author.id)
    }

    /// Removes a story from its author's tray, and the tray once it is empty (deleted here or elsewhere).
    func removeStoryLocally(_ storyId: String, authorId: String) {
        guard let trayIndex = storyTrays.firstIndex(where: { $0.author.id == authorId }) else { return }
        storyTrays[trayIndex].stories.removeAll { $0.id == storyId }
        if storyTrays[trayIndex].stories.isEmpty { storyTrays.remove(at: trayIndex) }
    }

    /// Adds a new story to its author's tray (creating the tray). My tray stays first; a fresh tray
    /// from someone else goes right after mine, where new stories belong.
    func insertStory(_ story: Story) {
        if let trayIndex = storyTrays.firstIndex(where: { $0.author.id == story.author.id }) {
            guard !storyTrays[trayIndex].stories.contains(where: { $0.id == story.id }) else { return }
            storyTrays[trayIndex].stories.append(story)
            storyTrays[trayIndex].allSeen = false
            storyTrays[trayIndex].latestAt = story.createdAt
            storyTrays[trayIndex].author = story.author
        } else {
            let tray = StoryTray(author: story.author, stories: [story], allSeen: story.seen, latestAt: story.createdAt)
            let position = story.author.isMe ? 0 : (myTray == nil ? 0 : 1)
            storyTrays.insert(tray, at: min(position, storyTrays.count))
        }
        var author = latest(story.author)
        author.hasStory = true
        author.storySeen = story.seen
        accountUpdates[author.id] = author
        if story.author.isMe {
            me?.hasStory = true
        }
    }
}
