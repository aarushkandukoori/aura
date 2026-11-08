import SwiftUI

/// Chat details, opened from the chat's title: rename the group and pick its emoji, see the
/// members (tap one for their profile), mute, or delete the chat.
struct ChatDetailsView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let conversationId: String
    /// Called after the chat was deleted, so the chat screen can close too.
    let onDeleted: () -> Void

    @State private var name = ""
    @State private var isConfirmingDelete = false
    @FocusState private var isNameFocused: Bool

    static let emojiChoices = ["💌", "🎉", "🎧", "🔥", "✨", "🌙", "🍕", "☕️",
                               "⚽️", "🎮", "📚", "🎬", "🌸", "🐸", "🏖️", "💪"]

    var body: some View {
        NavigationStack {
            Group {
                if let conversation = store.conversation(conversationId) {
                    details(conversation)
                } else {
                    EmptyStateView(systemImage: "bubble.left.and.bubble.right", title: "This chat is gone")
                }
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.background)
        .onAppear { name = store.conversation(conversationId)?.title ?? "" }
    }

    private func details(_ conversation: Conversation) -> some View {
        List {
            header(conversation)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

            if conversation.isGroup {
                Section("Group name") {
                    HStack {
                        TextField("Name this group", text: $name)
                            .focused($isNameFocused)
                            .submitLabel(.done)
                        if isNameFocused && trimmedName != conversation.title && !trimmedName.isEmpty {
                            Button("Save") { isNameFocused = false }
                                .font(.subheadline.weight(.semibold))
                                .buttonStyle(.borderless)
                        }
                    }
                    .listRowBackground(Theme.surface)
                    // Done on the keyboard, Save, or tapping away all end editing, which saves the name.
                    .onChange(of: isNameFocused) { _, focused in
                        if !focused { rename(conversation) }
                    }
                }
                Section("Emoji") {
                    emojiGrid(conversation)
                        .listRowBackground(Theme.surface)
                }
            }

            Section(conversation.isGroup ? "Members · \(conversation.members.count + 1)" : "Profile") {
                ForEach(conversation.members) { member in
                    memberRow(member)
                }
                if conversation.isGroup, let me = store.me {
                    HStack(spacing: 12) {
                        AvatarView(path: me.avatar, size: 40)
                        Text("You")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.text)
                        Spacer()
                    }
                    .listRowBackground(Theme.surface)
                }
            }

            Section {
                Toggle("Mute messages", isOn: muteBinding(conversation))
                    .tint(Theme.accent)
                    .listRowBackground(Theme.surface)
            } footer: {
                Text("Muted chats don't send you banners.")
            }

            Section {
                Button("Delete chat", role: .destructive) {
                    isConfirmingDelete = true
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Theme.surface)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .confirmationDialog("Delete this chat?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { delete(conversation) }
        } message: {
            Text("All of its messages will be removed. This can't be undone.")
        }
    }

    private func header(_ conversation: Conversation) -> some View {
        VStack(spacing: 6) {
            ConversationAvatar(conversation: conversation, size: 84)
                .padding(.bottom, 4)
            Text(conversation.title)
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            if !conversation.isGroup, let member = conversation.members.first {
                Text(Format.activeStatus(store.latest(member).lastActiveAt) ?? member.username)
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    private func emojiGrid(_ conversation: Conversation) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 8), spacing: 8) {
            ForEach(Self.emojiChoices, id: \.self) { emoji in
                let isSelected = conversation.emoji == emoji
                Button {
                    setEmoji(emoji, for: conversation)
                } label: {
                    Text(emoji)
                        .font(.system(size: 24))
                        .frame(width: 38, height: 38)
                        .background(isSelected ? Theme.accent.opacity(0.18) : Color.clear, in: Circle())
                        .overlay(Circle().strokeBorder(isSelected ? Theme.accent : Color.clear, lineWidth: 2))
                }
                .buttonStyle(.borderless)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(.vertical, 6)
    }

    /// A member: tap the name for their profile; Follow on the right if I don't follow them yet.
    private func memberRow(_ member: Account) -> some View {
        HStack(spacing: 12) {
            Button {
                openProfile(member)
            } label: {
                HStack(spacing: 12) {
                    AvatarView(account: member, size: 40)
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 3) {
                            Text(member.displayName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                            if member.verified { VerifiedBadge(size: 11) }
                        }
                        Text(member.username)
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if !store.latest(member).iFollow {
                FollowButton(account: member)
            }
        }
        .listRowBackground(Theme.surface)
    }

    // MARK: - Actions

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func rename(_ conversation: Conversation) {
        guard !trimmedName.isEmpty, trimmedName != conversation.title else {
            name = conversation.title
            return
        }
        update(conversation, UpdateConversationRequest(title: trimmedName))
    }

    private func setEmoji(_ emoji: String, for conversation: Conversation) {
        guard emoji != conversation.emoji else { return }
        Haptics.selection()
        update(conversation, UpdateConversationRequest(emoji: emoji))
    }

    private func muteBinding(_ conversation: Conversation) -> Binding<Bool> {
        Binding(
            get: { conversation.muted },
            set: { update(conversation, UpdateConversationRequest(muted: $0)) }
        )
    }

    private func update(_ conversation: Conversation, _ request: UpdateConversationRequest) {
        Task {
            do {
                try await store.updateConversation(conversation.id, request)
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
        }
    }

    private func openProfile(_ member: Account) {
        dismiss()
        store.navigate(to: .profile(member.username))
    }

    private func delete(_ conversation: Conversation) {
        dismiss()
        Task {
            do {
                try await store.deleteConversation(conversation.id)
                onDeleted()
            } catch {
                if !error.isCancellation { store.showToast(error.localizedDescription) }
            }
        }
    }
}
