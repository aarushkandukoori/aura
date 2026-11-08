import SwiftUI

/// Send a post to friends: search, tap chats or people (as many as you like), add a message, Send.
/// MainTabView presents it as a sheet when `store.showShareSheet(for:)` is called.
struct ShareSheetView: View {
    @Environment(AppStore.self) private var store
    let post: Post

    @State private var query = ""
    /// Characters I follow, for people I don't have a chat with yet.
    @State private var following: [Account] = []
    @State private var searchResults: [Account] = []
    /// Everyone picked, in the order they were tapped.
    @State private var picked: [ShareTarget] = []
    @State private var message = ""
    @State private var isSending = false
    @State private var sendError: String?

    private var isSearching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            header
            ChatSearchField(prompt: "Search", text: $query)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            ScrollView {
                if targets.isEmpty {
                    Text(isSearching ? "No one found for \"\(query)\"" : "No chats yet")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 40)
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 18) {
                        ForEach(targets) { target in
                            cell(for: target)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                }
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !picked.isEmpty {
                sendBar
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.25), value: picked.isEmpty)
        .task { await loadFollowing() }
        .task(id: query) { await search() }
    }

    // MARK: - Who can be picked

    /// Recent chats first, then people without a chat yet. While searching, only matches.
    private var targets: [ShareTarget] {
        let term = query.trimmingCharacters(in: .whitespaces).lowercased()
        let chats = store.conversations.filter { term.isEmpty || matches($0, term: term) }
        // Someone I already have a DM with appears as that chat, not twice.
        let dmPartnerIds = Set(store.conversations.filter { !$0.isGroup }.compactMap { $0.members.first?.id })
        let people = (isSearching ? searchResults : following).filter { !dmPartnerIds.contains($0.id) }
        return chats.map(ShareTarget.chat) + people.map(ShareTarget.person)
    }

    private func matches(_ conversation: Conversation, term: String) -> Bool {
        conversation.title.lowercased().contains(term) || conversation.members.contains {
            $0.username.lowercased().contains(term) || $0.displayName.lowercased().contains(term)
        }
    }

    // MARK: - Parts

    private var header: some View {
        HStack(spacing: 12) {
            RemoteImage(path: post.thumbnail)
                .frame(width: 38, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(post.isReel ? "Share reel" : "Share post")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                Text("by \(post.author.username)")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.top, 22)
        .padding(.bottom, 12)
    }

    private func cell(for target: ShareTarget) -> some View {
        let isPicked = picked.contains(target)
        return Button {
            toggle(target)
        } label: {
            VStack(spacing: 6) {
                Group {
                    switch target {
                    case .chat(let conversation): ConversationAvatar(conversation: conversation, size: 64)
                    case .person(let account): AvatarView(account: account, size: 64)
                    }
                }
                .scaleEffect(isPicked ? 0.9 : 1)
                .overlay(alignment: .bottomTrailing) {
                    if isPicked {
                        Image(systemName: "checkmark.circle.fill")
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, Theme.accent)
                            .font(.system(size: 22))
                            .background(Circle().fill(Theme.background).padding(-2))
                            .transition(.scale.combined(with: .opacity))
                    }
                }
                Text(target.name)
                    .font(.caption)
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            .contentShape(Rectangle())
            .animation(.spring(duration: 0.25, bounce: 0.4), value: isPicked)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isPicked ? .isSelected : [])
    }

    private var sendBar: some View {
        VStack(spacing: 10) {
            TextField("Write a message...", text: $message, axis: .vertical)
                .lineLimit(1...3)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.secondaryFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            if let sendError {
                Text(sendError)
                    .font(.footnote)
                    .foregroundStyle(Theme.like)
            }
            Button(action: send) {
                if isSending {
                    ProgressView().tint(.white)
                } else {
                    Text(picked.count == 1 ? "Send" : "Send to \(picked.count)")
                }
            }
            .buttonStyle(.aura(.primary, size: .large, fullWidth: true))
            .disabled(isSending)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(Theme.background)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.border).frame(height: 0.5)
        }
    }

    // MARK: - Actions

    private func toggle(_ target: ShareTarget) {
        Haptics.selection()
        if let index = picked.firstIndex(of: target) {
            picked.remove(at: index)
        } else {
            picked.append(target)
        }
    }

    private func loadFollowing() async {
        guard let me = store.me, let list = try? await API.following(me.username) else { return }
        // Only characters write back, so they're the people worth sending things to.
        following = list.accounts.filter { $0.kind == .cast }
    }

    private func search() async {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else {
            searchResults = []
            return
        }
        try? await Task.sleep(for: .milliseconds(250)) // wait for a pause in typing
        if Task.isCancelled { return }
        if let result = try? await API.search(term) {
            searchResults = result.accounts.filter { $0.kind == .cast }
        }
    }

    /// People without a chat get a DM first; then the post goes into every picked chat at once.
    private func send() {
        isSending = true
        sendError = nil
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        let targets = picked
        Task {
            do {
                var conversationIds: [String] = []
                for target in targets {
                    switch target {
                    case .chat(let conversation):
                        conversationIds.append(conversation.id)
                    case .person(let account):
                        conversationIds.append(try await store.startConversation(with: [account.id]).id)
                    }
                }
                try await store.share(postId: post.id, to: conversationIds, text: text.isEmpty ? nil : text)
                store.showToast(targets.count == 1 ? "Sent to \(targets[0].name)" : "Sent to \(targets.count) chats")
                store.shareSheetPost = nil
            } catch {
                if !error.isCancellation { sendError = error.localizedDescription }
                isSending = false
            }
        }
    }
}

/// Something a post can be shared to: an existing chat, or a person to start a DM with.
enum ShareTarget: Identifiable, Hashable {
    case chat(Conversation)
    case person(Account)

    var id: String {
        switch self {
        case .chat(let conversation): "chat-\(conversation.id)"
        case .person(let account): "person-\(account.id)"
        }
    }

    var name: String {
        switch self {
        case .chat(let conversation): conversation.title
        case .person(let account): account.displayName
        }
    }

    /// Picked state compares ids, so a chat stays picked when a live update changes its preview.
    static func == (lhs: ShareTarget, rhs: ShareTarget) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
