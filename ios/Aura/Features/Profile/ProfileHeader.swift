import SwiftUI

/// The top of a profile: picture, counts, name, bio, "Followed by ..." and the action buttons.
struct ProfileHeader: View {
    @Environment(AppStore.self) private var store
    let profile: Profile
    let isMe: Bool
    /// My aura score (only shown on my own profile).
    var aura: Int?

    @State private var openingChat = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 24) {
                avatar
                stats
            }
            details
            if isMe, let aura {
                AuraChip(aura: aura)
            }
            if !isMe, !profile.mutuals.isEmpty {
                followedBy
            }
            actions
                .padding(.top, 2)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 16)
    }

    // MARK: - Picture and counts

    private var avatar: some View {
        let account = store.latest(profile.account)
        return AvatarView(account: profile.account, size: 88, showsStoryRing: true, action: avatarAction(for: account))
            .overlay(alignment: .bottomTrailing) {
                if isMe && !account.hasStory {
                    Button { store.show([], in: .create) } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 26, height: 26)
                            .background(Theme.accent, in: Circle())
                            .overlay(Circle().stroke(Theme.background, lineWidth: 3))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Create")
                }
            }
    }

    /// Tapping the picture plays their story when they have one.
    private func avatarAction(for account: Account) -> (() -> Void)? {
        guard account.hasStory else { return nil }
        return { Task { await store.openStories(for: account) } }
    }

    private var stats: some View {
        HStack(spacing: 0) {
            stat(profile.postCount, "post", route: nil)
            stat(followers, "follower", route: .followers(profile.username))
            stat(profile.following, "following", plural: "following", route: .following(profile.username))
        }
        .frame(maxWidth: .infinity)
    }

    /// Their follower count, including my follow or unfollow from a moment ago.
    private var followers: Int {
        guard !isMe else { return profile.followers }
        let followingNow = store.latest(profile.account).iFollow
        if followingNow == profile.iFollow { return profile.followers }
        return max(0, profile.followers + (followingNow ? 1 : -1))
    }

    @ViewBuilder private func stat(_ value: Int, _ singular: String, plural: String? = nil, route: Route?) -> some View {
        let label = VStack(spacing: 2) {
            CountText(value: value)
                .font(.headline)
                .foregroundStyle(Theme.text)
            Text(value == 1 ? singular : (plural ?? singular + "s"))
                .font(.subheadline)
                .foregroundStyle(Theme.text)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())

        if let route {
            NavigationLink(value: route) { label }
                .buttonStyle(.plain)
        } else {
            label
        }
    }

    // MARK: - Name and bio

    private var details: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(profile.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                if profile.verified { VerifiedBadge(size: 13) }
                if !profile.pronouns.isEmpty {
                    Text(profile.pronouns)
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }
            }
            if let occupation = profile.occupation, !occupation.isEmpty {
                Text(occupation)
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
            if !profile.bio.isEmpty {
                Text(Format.richText(profile.bio))
                    .font(.subheadline)
                    .foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// "Followed by maya.chen, dev.k and 12 others" with their pictures (taps open the list).
    private var followedBy: some View {
        NavigationLink(value: Route.followers(profile.username)) {
            HStack(spacing: 8) {
                StackedAvatars(paths: profile.mutuals.map(\.avatar), size: 22)
                Text(followedByText)
                    .font(.footnote)
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
            }
        }
        .buttonStyle(.plain)
    }

    private var followedByText: AttributedString {
        let names = profile.mutuals.prefix(2).map(\.username)
        let others = max(0, profile.mutualCount - names.count)
        var text = AttributedString("Followed by ")
        for (index, name) in names.enumerated() {
            var bold = AttributedString(name)
            bold.inlinePresentationIntent = .stronglyEmphasized
            text += bold
            if index < names.count - 1 { text += AttributedString(others > 0 ? ", " : " and ") }
        }
        if others > 0 {
            var rest = AttributedString(Format.count(others, "other"))
            rest.inlinePresentationIntent = .stronglyEmphasized
            text += AttributedString(" and ") + rest
        }
        return text
    }

    // MARK: - Buttons

    @ViewBuilder private var actions: some View {
        if isMe {
            HStack(spacing: 8) {
                NavigationLink(value: Route.editProfile) { Text("Edit profile") }
                    .buttonStyle(.aura(.secondary, fullWidth: true))
                if let url = ProfileLinks.url(for: profile.username) {
                    ShareLink(item: url, message: Text("Come say hi on Aura: @\(profile.username)")) {
                        Text("Share profile")
                    }
                    .buttonStyle(.aura(.secondary, fullWidth: true))
                }
            }
        } else {
            HStack(spacing: 8) {
                FollowButton(account: profile.account, size: .regular, fullWidth: true)
                Button {
                    Task { await openChat() }
                } label: {
                    if openingChat { ProgressView() } else { Text("Message") }
                }
                .buttonStyle(.aura(.secondary, fullWidth: true))
                .disabled(openingChat)
            }
        }
    }

    /// Opens our DM (creating it the first time) and shows the chat.
    private func openChat() async {
        openingChat = true
        defer { openingChat = false }
        do {
            let conversation = try await store.startConversation(with: [profile.id])
            store.navigate(to: .chat(conversation.id))
        } catch {
            if !error.isCancellation { store.showToast(error.localizedDescription) }
        }
    }
}

/// "✦ 12.4K aura": my playful score, which climbs as people engage with me.
private struct AuraChip: View {
    @Environment(AppStore.self) private var store
    let aura: Int

    var body: some View {
        Button {
            store.showToast("Your aura grows every time people show you love ✨")
        } label: {
            HStack(spacing: 6) {
                Text("✦")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(Theme.auraGradient)
                CountText(value: aura)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Theme.text)
                Text("aura")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(Theme.auraGradient.opacity(0.12), in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.ringGradient, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(Format.count(aura)) aura")
    }
}

/// A row of highlight circles under the bio. Tapping one plays it in the story viewer.
struct HighlightsRow: View {
    @Environment(AppStore.self) private var store
    let highlights: [Highlight]
    let owner: Account

    var body: some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 16) {
                ForEach(highlights) { highlight in
                    Button {
                        Task { await store.openHighlight(highlight, of: owner) }
                    } label: {
                        VStack(spacing: 6) {
                            RemoteImage(path: highlight.cover)
                                .frame(width: 62, height: 62)
                                .clipShape(Circle())
                                .padding(3)
                                .overlay(Circle().strokeBorder(Theme.seenRing, lineWidth: 1.5))
                            Text(highlight.title)
                                .font(.caption)
                                .foregroundStyle(Theme.text)
                                .lineLimit(1)
                                .frame(width: 74)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Highlight: \(highlight.title)")
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .padding(.bottom, 14)
    }
}

/// The icon tabs above the grid (Posts, Reels, Tagged, and Saved on my profile).
struct ProfileTabBar: View {
    let tabs: [ProfileGridTab]
    @Binding var selection: ProfileGridTab
    @Namespace private var underline

    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs) { tab in
                let isSelected = selection == tab
                Button {
                    Haptics.selection()
                    withAnimation(.snappy(duration: 0.25)) { selection = tab }
                } label: {
                    Image(systemName: tab.icon(selected: isSelected))
                        .font(.system(size: 20))
                        .foregroundStyle(isSelected ? Theme.text : Theme.muted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .overlay(alignment: .bottom) {
                            if isSelected {
                                Rectangle()
                                    .fill(Theme.text)
                                    .frame(height: 1.5)
                                    .matchedGeometryEffect(id: "underline", in: underline)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .background(Theme.background)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.border).frame(height: 0.5)
        }
    }
}
