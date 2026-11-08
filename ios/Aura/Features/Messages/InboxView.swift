import SwiftUI

/// Messages: my chats (Primary) and message requests, with search. Opened from the paper plane
/// in the Home top bar. Everything here updates live: new messages move a chat to the top,
/// "typing..." appears, unread dots come and go.
struct InboxView: View {
    @Environment(AppStore.self) private var store

    @State private var showsRequests = false
    @State private var query = ""
    /// People matching the search, to start a new chat with.
    @State private var people: [Account] = []
    @State private var hasLoaded = false
    /// The chat waiting for "Delete?" to be confirmed.
    @State private var chatToDelete: Conversation?

    private var isSearching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            ChatSearchField(prompt: "Search", text: $query)
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)
            if !isSearching {
                InboxTabs(showsRequests: $showsRequests, requestCount: store.requests.count)
            }
            // Re-draws once a minute so "5m" ages without a refresh.
            TimelineView(.everyMinute) { context in
                List {
                    if isSearching {
                        searchResults(now: context.date)
                    } else {
                        chats(now: context.date)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .scrollDismissesKeyboard(.immediately)
            }
        }
        .navigationTitle(store.me?.username ?? "Messages")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: Route.newMessage) {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel("New message")
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .refreshable { await store.loadConversations() }
        .task {
            await store.loadConversations()
            hasLoaded = true
        }
        .task(id: query) { await searchPeople() }
        .confirmationDialog("Delete this chat?", isPresented: isConfirmingDelete, titleVisibility: .visible,
                            presenting: chatToDelete) { conversation in
            Button("Delete", role: .destructive) { delete(conversation) }
        } message: { conversation in
            Text(conversation.isGroup
                 ? "\"\(conversation.title)\" and all of its messages will be removed."
                 : "Your chat with \(conversation.title) and all of its messages will be removed.")
        }
    }

    // MARK: - Lists

    @ViewBuilder private func chats(now: Date) -> some View {
        let list = showsRequests ? store.requests : store.conversations
        if list.isEmpty {
            emptyState
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else {
            if showsRequests {
                Text("People reaching out for the first time. Accept a request to move it to Primary.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
            ForEach(list) { conversation in
                row(for: conversation, now: now)
            }
        }
    }

    @ViewBuilder private func searchResults(now: Date) -> some View {
        let term = query.trimmingCharacters(in: .whitespaces).lowercased()
        let matches = (store.conversations + store.requests).filter { matchesSearch($0, term: term) }
        // People who already have a DM show up as that chat instead.
        let dmPartnerIds = Set(matches.filter { !$0.isGroup }.compactMap { $0.members.first?.id })
        let newPeople = people.filter { !dmPartnerIds.contains($0.id) }

        if matches.isEmpty && newPeople.isEmpty {
            Text("No results for \"\(query)\"")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        }
        if !matches.isEmpty {
            Section {
                ForEach(matches) { conversation in
                    row(for: conversation, now: now)
                }
            } header: {
                sectionHeader("Chats")
            }
        }
        if !newPeople.isEmpty {
            Section {
                ForEach(newPeople) { person in
                    Button {
                        startChat(with: person)
                    } label: {
                        ChatPersonRow(account: person)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Theme.background)
                }
            } header: {
                sectionHeader("More people")
            }
        }
    }

    private func row(for conversation: Conversation, now: Date) -> some View {
        Button {
            store.navigate(to: .chat(conversation.id))
        } label: {
            ConversationRow(conversation: conversation, now: now)
        }
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Theme.background)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                chatToDelete = conversation
            } label: {
                Label("Delete", systemImage: "trash")
            }
            .tint(Theme.like)
            if conversation.isRequest {
                Button {
                    accept(conversation)
                } label: {
                    Label("Accept", systemImage: "checkmark")
                }
                .tint(Theme.accent)
            } else {
                Button {
                    toggleMute(conversation)
                } label: {
                    Label(conversation.muted ? "Unmute" : "Mute",
                          systemImage: conversation.muted ? "bell" : "bell.slash")
                }
                .tint(Color(hex: 0x8E8E9A))
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.text)
            .textCase(nil)
    }

    @ViewBuilder private var emptyState: some View {
        if !hasLoaded && store.conversations.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
        } else if showsRequests {
            EmptyStateView(systemImage: "tray",
                           title: "No message requests",
                           message: "When someone new messages you, it shows up here.")
                .padding(.top, 40)
        } else {
            EmptyStateView(systemImage: "paperplane",
                           title: "Your messages",
                           message: "Send a message to start a chat with your friends.",
                           actionTitle: "Send message") {
                store.navigate(to: .newMessage)
            }
            .padding(.top, 40)
        }
    }

    // MARK: - Actions

    private var isConfirmingDelete: Binding<Bool> {
        Binding(get: { chatToDelete != nil }, set: { if !$0 { chatToDelete = nil } })
    }

    private func matchesSearch(_ conversation: Conversation, term: String) -> Bool {
        if conversation.title.lowercased().contains(term) { return true }
        return conversation.members.contains {
            $0.username.lowercased().contains(term) || $0.displayName.lowercased().contains(term)
        }
    }

    /// Asks the server for people matching the search (a short pause first, so typing stays smooth).
    private func searchPeople() async {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else {
            people = []
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        if Task.isCancelled { return }
        if let result = try? await API.search(term) {
            // Only characters write back, so they're the people worth messaging.
            people = result.accounts.filter { $0.kind == .cast }
        }
    }

    private func startChat(with person: Account) {
        Task {
            do {
                let conversation = try await store.startConversation(with: [person.id])
                store.navigate(to: .chat(conversation.id))
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
        }
    }

    private func delete(_ conversation: Conversation) {
        Task {
            do {
                try await store.deleteConversation(conversation.id)
                Haptics.success()
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
        }
    }

    private func accept(_ conversation: Conversation) {
        Task {
            do {
                try await store.acceptRequest(conversation.id)
                Haptics.success()
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
        }
    }

    private func toggleMute(_ conversation: Conversation) {
        Task {
            do {
                try await store.updateConversation(conversation.id, UpdateConversationRequest(muted: !conversation.muted))
                Haptics.selection()
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
        }
    }
}

/// "Primary" and "Requests (2)" with a sliding underline.
private struct InboxTabs: View {
    @Binding var showsRequests: Bool
    let requestCount: Int

    @Namespace private var underline

    var body: some View {
        HStack(spacing: 0) {
            tab("Primary", selected: !showsRequests) { showsRequests = false }
            tab(requestCount > 0 ? "Requests (\(requestCount))" : "Requests", selected: showsRequests) { showsRequests = true }
        }
        .padding(.horizontal, 16)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.border).frame(height: 0.5)
        }
    }

    private func tab(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            guard !selected else { return }
            Haptics.selection()
            withAnimation(.snappy(duration: 0.25)) { action() }
        } label: {
            VStack(spacing: 9) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(selected ? Theme.text : Theme.muted)
                ZStack {
                    if selected {
                        Capsule()
                            .fill(Theme.text)
                            .matchedGeometryEffect(id: "underline", in: underline)
                    }
                }
                .frame(height: 2)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
