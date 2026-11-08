import SwiftUI

/// A conversation, full screen: messages grouped by sender with time labels, photos, shared posts,
/// story replies, reply quotes and reactions, the typing bubble and "Seen", and the composer.
///
/// Scrolling: the chat opens at the bottom and follows new messages while you're at the bottom.
/// If you've scrolled up to read, it stays put and a "New messages" chip appears instead.
/// Scrolling to the top loads older messages without moving what you're looking at.
struct ChatView: View {
    @Environment(AppStore.self) private var store
    let conversationId: String

    /// The row at the bottom edge of the screen. The scroll view updates it as you scroll.
    @State private var scrolledId: String?
    /// True while the newest messages are in view: then anything new scrolls into view too.
    /// Only your own scrolling turns it off (see `scrolled(to:)`).
    @State private var followsBottom = true
    @State private var hasLoaded = false
    @State private var loadError: String?
    @State private var isLoadingOlder = false
    @State private var showsNewMessagesChip = false
    @State private var replyingTo: Message?
    @State private var showsDetails = false
    @State private var openPhoto: ChatPhoto?
    /// A message to make pop for a moment (after tapping a reply quote).
    @State private var highlightedId: String?
    @FocusState private var isComposerFocused: Bool

    private var conversation: Conversation? { store.conversation(conversationId) }
    private var messages: [Message] { store.messages[conversationId] ?? [] }

    var body: some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .toolbar(.hidden, for: .tabBar)
            .sheet(isPresented: $showsDetails) {
                ChatDetailsView(conversationId: conversationId, onDeleted: closeChat)
                    .environment(store)
            }
            .fullScreenCover(item: $openPhoto) { photo in
                ChatPhotoViewer(path: photo.path)
            }
            // While this chat is on screen: no banners for it, and new messages count as read.
            .onAppear { store.activeConversationId = conversationId }
            .onDisappear {
                if store.activeConversationId == conversationId { store.activeConversationId = nil }
            }
            .task { await load() }
            .onChange(of: store.isLive) { _, isLive in
                // Back online (or back from the background): fetch anything missed meanwhile.
                if isLive && hasLoaded { Task { try? await store.loadMessages(conversationId) } }
            }
    }

    // MARK: - Screen

    @ViewBuilder private var content: some View {
        if messages.isEmpty && !hasLoaded {
            if let loadError {
                EmptyStateView(systemImage: "wifi.exclamationmark", title: "Couldn't open this chat",
                               message: loadError, actionTitle: "Try again") {
                    Task { await load() }
                }
                .frame(maxHeight: .infinity)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            messageList
        }
    }

    private var messageList: some View {
        let typers = store.typingMembers(in: conversationId)
        let items = ChatTimeline.items(messages: messages, conversation: conversation, typers: typers)
        return ScrollViewReader { reader in
            ScrollView {
                // A plain VStack, not a lazy one: every row has its real height, so keeping the
                // scroll position steady while messages arrive never fights with estimated heights.
                // Chats load 40 messages at a time, so this stays light.
                VStack(spacing: 0) {
                    historyStart
                    ForEach(items) { item in
                        row(for: item, reader: reader)
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 12)
            }
            .scrollPosition(id: $scrolledId, anchor: .bottom)
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .overlay(alignment: .bottom) {
                if showsNewMessagesChip {
                    NewMessagesChip { scrollToBottom(reader) }
                        .padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.spring(duration: 0.3), value: showsNewMessagesChip)
            .onChange(of: scrolledId) { _, id in
                scrolled(to: id)
            }
            // Something new at the bottom: a message, the typing bubble, or "Seen".
            .onChange(of: messages.last?.id) { oldId, _ in
                newestMessageChanged(hadMessages: oldId != nil, reader: reader)
            }
            .onChange(of: typers.isEmpty) {
                if followsBottom { scrollToBottom(reader) }
            }
            .onChange(of: conversation?.seenAt) {
                if followsBottom { scrollToBottom(reader) }
            }
            // Older messages were added above the one that was first: keep that one where it was
            // on screen, so what you're reading doesn't jump (even in the middle of a fling).
            .onChange(of: messages.first?.id) { oldFirstId, _ in
                guard let oldFirstId, messages.contains(where: { $0.id == oldFirstId }) else { return }
                reader.scrollTo(oldFirstId, anchor: .top)
            }
        }
    }

    /// The top of the list: a spinner while older messages exist (it loads them when scrolled
    /// near), otherwise the chat's intro.
    @ViewBuilder private var historyStart: some View {
        if store.hasOlderMessages(conversationId) {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                // True once the spinner is less than a screen away from the top edge.
                .onGeometryChange(for: Bool.self) { proxy in
                    proxy.frame(in: .scrollView).maxY > -400
                } action: { isNear in
                    if isNear { loadOlder() }
                }
                // A new identity per page re-arms the check above, so the next page loads
                // even if the spinner never left the screen.
                .id("older-\(messages.first?.id ?? "")")
        } else if hasLoaded, let conversation {
            ChatIntro(conversation: conversation)
        }
    }

    @ViewBuilder private func row(for item: ChatItem, reader: ScrollViewProxy) -> some View {
        switch item {
        case .time(let millis, _):
            ChatTimeSeparator(millis: millis)
        case .message(let message, let placement):
            MessageRow(message: message, placement: placement, conversation: conversation,
                       isHighlighted: highlightedId == message.id,
                       onReply: { startReply(to: message) },
                       onOpenPhoto: { openPhoto = ChatPhoto(path: $0.thumbnail) },
                       onJumpTo: { jump(to: $0, reader: reader) })
        case .status(let text):
            Text(text)
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.top, 4)
                .padding(.trailing, 4)
        case .typing(let typers):
            ChatTypingBubble(typers: typers)
        case .end:
            Color.clear.frame(height: 14)
        }
    }

    @ViewBuilder private var bottomBar: some View {
        if let conversation {
            VStack(spacing: 0) {
                if conversation.isRequest {
                    ChatRequestBar(conversation: conversation, onDeleted: closeChat)
                }
                ChatComposer(conversationId: conversationId, replyingTo: $replyingTo,
                             isFocused: $isComposerFocused)
            }
        }
    }

    @ToolbarContentBuilder private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            if let conversation {
                Button {
                    showsDetails = true
                } label: {
                    ChatTitle(conversation: conversation)
                }
                .buttonStyle(.plain)
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showsDetails = true
            } label: {
                Image(systemName: "info.circle")
            }
            .disabled(conversation == nil)
            .accessibilityLabel("Chat details")
        }
    }

    // MARK: - Loading

    private func load() async {
        if !hasLoaded {
            do {
                // Opened from a link before the inbox had this chat.
                if store.conversation(conversationId) == nil {
                    try await store.loadConversation(conversationId)
                }
                try await store.loadMessages(conversationId)
                hasLoaded = true
                loadError = nil
            } catch {
                if error.isCancellation { return }
                loadError = error.localizedDescription
                if !messages.isEmpty { hasLoaded = true } // keep showing what we already have
            }
        }
        await store.markConversationRead(conversationId)
    }

    /// Loads the page before the oldest message (the list keeps your place, see messageList).
    private func loadOlder() {
        // Never while following the bottom, so it can't fire while the chat is opening.
        guard hasLoaded, !followsBottom, !isLoadingOlder, store.hasOlderMessages(conversationId) else { return }
        isLoadingOlder = true
        Task {
            try? await store.loadOlderMessages(conversationId)
            isLoadingOlder = false
        }
    }

    // MARK: - Scrolling

    /// You scrolled: keep following new messages only while the newest rows are at the bottom edge.
    private func scrolled(to id: String?) {
        guard let id else { return } // jumps made in code can leave it empty; keep what we had
        followsBottom = ChatItem.newestIds.contains(id) || id == messages.last?.id
        if followsBottom { showsNewMessagesChip = false }
    }

    /// A new last message: mine always scrolls into view; theirs does when you're at the bottom,
    /// otherwise the "New messages" chip appears.
    private func newestMessageChanged(hadMessages: Bool, reader: ScrollViewProxy) {
        guard hadMessages, let newest = messages.last else { return } // not on the first load
        if newest.isMine || followsBottom {
            scrollToBottom(reader)
        } else {
            showsNewMessagesChip = true
        }
    }

    private func scrollToBottom(_ reader: ScrollViewProxy) {
        followsBottom = true
        showsNewMessagesChip = false
        withAnimation(.spring(duration: 0.35)) {
            reader.scrollTo(ChatItem.endId, anchor: .bottom)
        }
    }

    /// Tapping a reply quote: scroll to the original message and make it pop.
    private func jump(to messageId: String, reader: ScrollViewProxy) {
        guard messages.contains(where: { $0.id == messageId }) else {
            store.showToast("Scroll up to find that message")
            return
        }
        followsBottom = false
        withAnimation(.spring(duration: 0.4)) {
            reader.scrollTo(messageId, anchor: .center)
        }
        highlightedId = messageId
        Task {
            try? await Task.sleep(for: .seconds(0.9))
            if highlightedId == messageId { highlightedId = nil }
        }
    }

    // MARK: - Actions

    private func startReply(to message: Message) {
        replyingTo = message
        isComposerFocused = true
    }

    /// After deleting the chat (details sheet or request bar): leave this screen.
    private func closeChat() {
        let tab = store.selectedTab
        store.setPath(store.path(for: tab).filter { $0 != .chat(conversationId) }, for: tab)
    }
}

/// A photo opened full screen from a chat bubble.
struct ChatPhoto: Identifiable {
    let path: String
    var id: String { path }
}
