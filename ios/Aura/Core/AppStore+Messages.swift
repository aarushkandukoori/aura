import Foundation

/// Messages: the inbox, requests, chats, sending (optimistically), reactions and typing.
extension AppStore {
    // MARK: - Inbox

    func loadConversations() async {
        guard let response = try? await API.conversations() else { return }
        conversations = response.conversations
        requests = response.requests
    }

    /// A conversation from the inbox or requests.
    func conversation(_ id: String) -> Conversation? {
        conversations.first { $0.id == id } ?? requests.first { $0.id == id }
    }

    /// Fetches one conversation into the inbox (a chat opened from a link before the inbox loaded).
    @discardableResult
    func loadConversation(_ id: String) async throws -> Conversation {
        let conversation = try await API.conversation(id)
        upsertConversation(conversation)
        return conversation
    }

    /// Opens a DM (one id) or makes a group (two or more ids) and returns it.
    func startConversation(with memberIds: [String], title: String? = nil) async throws -> Conversation {
        let conversation = try await API.createConversation(CreateConversationRequest(memberIds: memberIds, title: title))
        upsertConversation(conversation)
        return conversation
    }

    /// Rename, change the emoji, or mute.
    func updateConversation(_ id: String, _ request: UpdateConversationRequest) async throws {
        upsertConversation(try await API.updateConversation(id, request))
    }

    /// Accepts a message request (it moves to Primary).
    func acceptRequest(_ id: String) async throws {
        upsertConversation(try await API.acceptConversation(id))
    }

    func deleteConversation(_ id: String) async throws {
        try await API.deleteConversation(id)
        removeConversationLocally(id)
    }

    /// Drops a conversation and its loaded messages (deleted here, or on another device).
    func removeConversationLocally(_ id: String) {
        conversations.removeAll { $0.id == id }
        requests.removeAll { $0.id == id }
        messages[id] = nil
        olderMessagesCursor[id] = nil
    }

    /// Puts a conversation in the right list (Primary or Requests), newest activity first.
    func upsertConversation(_ conversation: Conversation) {
        conversations.removeAll { $0.id == conversation.id }
        requests.removeAll { $0.id == conversation.id }
        if conversation.isRequest {
            requests.append(conversation)
            requests.sort { $0.lastMessageAt > $1.lastMessageAt }
        } else {
            conversations.append(conversation)
            conversations.sort { $0.lastMessageAt > $1.lastMessageAt }
        }
    }

    /// Changes a conversation in place, wherever it is.
    func updateConversationLocally(_ id: String, _ change: (inout Conversation) -> Void) {
        if let index = conversations.firstIndex(where: { $0.id == id }) {
            change(&conversations[index])
        } else if let index = requests.firstIndex(where: { $0.id == id }) {
            change(&requests[index])
        }
    }

    /// The members typing in a conversation right now (for "Maya is typing..." and the typing bubble).
    func typingMembers(in conversationId: String) -> [Account] {
        guard let conversation = conversation(conversationId) else { return [] }
        return conversation.members.filter { conversation.typing.contains($0.id) }
    }

    // MARK: - Reading a chat

    /// Loads the newest page of a chat into `messages[conversationId]`.
    func loadMessages(_ conversationId: String) async throws {
        let page = try await API.messages(conversationId: conversationId)
        // Keep any of my messages that are still sending.
        let sending = (messages[conversationId] ?? []).filter { $0.id.hasPrefix(Self.localPrefix) }
        messages[conversationId] = page.items + sending
        olderMessagesCursor[conversationId] = page.nextCursor
    }

    func hasOlderMessages(_ conversationId: String) -> Bool {
        olderMessagesCursor[conversationId] != nil
    }

    /// Loads the page before the oldest loaded message.
    func loadOlderMessages(_ conversationId: String) async throws {
        guard let cursor = olderMessagesCursor[conversationId] else { return }
        let page = try await API.messages(conversationId: conversationId, cursor: cursor)
        let known = Set((messages[conversationId] ?? []).map(\.id))
        messages[conversationId] = page.items.filter { !known.contains($0.id) } + (messages[conversationId] ?? [])
        olderMessagesCursor[conversationId] = page.nextCursor
    }

    /// Marks a chat read (ChatView calls it when it opens and the store calls it for live messages).
    func markConversationRead(_ conversationId: String) async {
        updateConversationLocally(conversationId) { $0.unread = 0 }
        if let fresh = try? await API.markConversationRead(conversationId) { badges = fresh }
    }

    // MARK: - Sending

    /// Local copies of my messages that are still sending have ids starting with this.
    static let localPrefix = "local-"

    /// Sends a message. It shows in the chat right away and is swapped for the server's copy when
    /// the server answers. If sending fails it stays, marked in `failedMessageIds`, so the chat can offer a retry.
    func sendMessage(to conversationId: String, text: String = "", media: Media? = nil,
                     replyTo: Message? = nil, sharedPostId: String? = nil) async {
        guard let me else { return }
        let local = Message(
            id: Self.localPrefix + UUID().uuidString,
            conversationId: conversationId,
            sender: me.account,
            text: text,
            media: media,
            sharedPost: sharedPostId.flatMap { posts[$0] },
            story: nil,
            replyTo: replyTo.map { ReplyRef(id: $0.id, text: $0.text, senderName: $0.sender.displayName) },
            reactions: [],
            createdAt: Date().millis
        )
        appendMessage(local)
        await deliver(local, replyToId: replyTo?.id, sharedPostId: sharedPostId)
    }

    /// Tries a failed message again.
    func retryMessage(_ message: Message) async {
        failedMessageIds.remove(message.id)
        await deliver(message, replyToId: message.replyTo?.id, sharedPostId: message.sharedPost?.id)
    }

    private func deliver(_ local: Message, replyToId: String?, sharedPostId: String?) async {
        let body = SendMessageRequest(text: local.text.isEmpty ? nil : local.text, media: local.media,
                                      sharedPostId: sharedPostId, replyToId: replyToId)
        do {
            let sent = try await API.sendMessage(conversationId: local.conversationId, body)
            replaceLocalMessage(local.id, with: sent)
        } catch {
            failedMessageIds.insert(local.id)
        }
    }

    /// Adds a message to its chat (skipping duplicates) and moves the conversation to the top.
    func appendMessage(_ message: Message) {
        var list = messages[message.conversationId] ?? []
        guard !list.contains(where: { $0.id == message.id }) else { return }
        list.append(message)
        messages[message.conversationId] = list
        updateConversationLocally(message.conversationId) {
            $0.lastMessage = message
            $0.lastMessageAt = max($0.lastMessageAt, message.createdAt)
        }
        conversations.sort { $0.lastMessageAt > $1.lastMessageAt }
    }

    /// Swaps my local copy for the server's message (or drops it if the live event already added it).
    private func replaceLocalMessage(_ localId: String, with sent: Message) {
        var list = messages[sent.conversationId] ?? []
        if list.contains(where: { $0.id == sent.id }) {
            list.removeAll { $0.id == localId }
        } else if let index = list.firstIndex(where: { $0.id == localId }) {
            list[index] = sent
        } else {
            list.append(sent)
        }
        messages[sent.conversationId] = list
        failedMessageIds.remove(localId)
    }

    /// A live `message.new` for one of my own messages: replace the matching local copy instead of
    /// showing it twice.
    func mergeMyMessage(_ message: Message) {
        guard var list = messages[message.conversationId] else { return }
        if let index = list.firstIndex(where: {
            $0.id.hasPrefix(Self.localPrefix) && $0.text == message.text && $0.media?.url == message.media?.url
        }) {
            list[index] = message
            messages[message.conversationId] = list
        } else {
            appendMessage(message)
        }
    }

    // MARK: - Reactions

    /// Sets my reaction (nil removes it). Shows right away, then takes the server's list.
    func react(to message: Message, emoji: String?) async {
        let myId = me?.id ?? "me"
        updateMessage(message.id, in: message.conversationId) { message in
            message.reactions.removeAll { $0.accountId == myId }
            if let emoji { message.reactions.append(Reaction(accountId: myId, emoji: emoji)) }
        }
        if emoji != nil { Haptics.tap() }
        if let reactions = try? await API.reactToMessage(message.id, emoji: emoji) {
            updateMessage(message.id, in: message.conversationId) { $0.reactions = reactions }
        }
    }

    /// Changes a loaded message in place.
    func updateMessage(_ id: String, in conversationId: String, _ change: (inout Message) -> Void) {
        guard var list = messages[conversationId], let index = list.firstIndex(where: { $0.id == id }) else { return }
        change(&list[index])
        messages[conversationId] = list
    }
}
