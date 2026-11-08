import SwiftUI

/// Whether an avatar gets a story ring.
enum StoryRingState {
    case none
    case unseen   // animated aura gradient
    case seen     // flat gray
}

/// A round profile picture, optionally with a story ring and a tap action.
///
///     AvatarView(account: post.author, size: 32, showsStoryRing: true) { ... open stories ... }
///     AvatarView(path: banner.avatar, size: 40)
///
/// `size` is the whole thing, ring included, so rows line up whether or not someone has a story.
/// With an account, the ring follows the store's freshest info (it turns gray everywhere once you've
/// watched the story).
struct AvatarView: View {
    @Environment(AppStore.self) private var store

    private let account: Account?
    private let path: String?
    private let fixedRing: StoryRingState
    private let showsStoryRing: Bool
    let size: CGFloat
    let action: (() -> Void)?

    /// An account's avatar. With `showsStoryRing`, a ring appears when they have an active story.
    init(account: Account?, size: CGFloat = 32, showsStoryRing: Bool = false, action: (() -> Void)? = nil) {
        self.account = account
        self.path = account?.avatar
        self.fixedRing = .none
        self.showsStoryRing = showsStoryRing
        self.size = size
        self.action = action
    }

    /// An avatar from a server path, with a ring you choose.
    init(path: String?, size: CGFloat = 32, ring: StoryRingState = .none, action: (() -> Void)? = nil) {
        self.account = nil
        self.path = path
        self.fixedRing = ring
        self.showsStoryRing = false
        self.size = size
        self.action = action
    }

    var body: some View {
        if let action {
            Button(action: action) { content }
                .buttonStyle(.plain)
        } else {
            content
        }
    }

    private var content: some View {
        let current = account.map { store.latest($0) }
        let ring = ringState(for: current)
        let ringWidth = max(2, size * 0.045)
        let gap = max(1.5, size * 0.04)
        let imageSize = ring == .none ? size : size - 2 * (ringWidth + gap)
        return ZStack {
            StoryRing(state: ring, lineWidth: ringWidth)
            Group {
                if let avatar = current?.avatar ?? path {
                    RemoteImage(path: avatar)
                } else {
                    DefaultAvatar()
                }
            }
            .frame(width: imageSize, height: imageSize)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(Theme.text.opacity(0.08), lineWidth: 0.5))
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .accessibilityElement()
        .accessibilityLabel(current.map { "\($0.username)'s profile picture" } ?? "Profile picture")
    }

    private func ringState(for account: Account?) -> StoryRingState {
        guard showsStoryRing, let account else { return fixedRing }
        guard account.hasStory else { return .none }
        return account.storySeen ? .seen : .unseen
    }
}

/// The ring around an avatar: a slowly turning aura gradient for unseen stories, gray for seen ones.
struct StoryRing: View {
    var state: StoryRingState
    var lineWidth: CGFloat

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spinning = false

    var body: some View {
        switch state {
        case .none:
            EmptyView()
        case .seen:
            Circle().strokeBorder(Theme.seenRing, lineWidth: max(1, lineWidth * 0.6))
        case .unseen:
            Circle()
                .strokeBorder(Theme.ringGradient, lineWidth: lineWidth)
                .rotationEffect(.degrees(spinning ? 360 : 0))
                .animation(reduceMotion ? nil : .linear(duration: 6).repeatForever(autoreverses: false), value: spinning)
                .onAppear { spinning = true }
        }
    }
}

/// The silhouette for accounts without a picture.
struct DefaultAvatar: View {
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Theme.secondaryFill
                Image(systemName: "person.fill")
                    .resizable()
                    .scaledToFit()
                    .frame(width: geometry.size.width * 0.5)
                    .offset(y: geometry.size.width * 0.06)
                    .foregroundStyle(Theme.muted.opacity(0.7))
            }
        }
    }
}

/// Up to three overlapping avatars ("Liked by" rows, mutual followers).
struct StackedAvatars: View {
    let paths: [String?]
    var size: CGFloat = 20

    var body: some View {
        HStack(spacing: -size * 0.32) {
            ForEach(Array(paths.prefix(3).enumerated()), id: \.offset) { index, path in
                AvatarView(path: path, size: size)
                    .padding(1.5)
                    .background(Circle().fill(Theme.background))
                    .zIndex(Double(3 - index))
            }
        }
    }
}

/// The picture for a conversation: the other person's avatar for a DM (with a green dot when they're
/// active), or the group's emoji / two member avatars for a group.
struct ConversationAvatar: View {
    @Environment(AppStore.self) private var store
    let conversation: Conversation
    var size: CGFloat = 52

    var body: some View {
        if conversation.isGroup {
            groupPicture
        } else if let member = conversation.members.first {
            AvatarView(account: member, size: size)
                .overlay(alignment: .bottomTrailing) {
                    if store.latest(member).isActiveNow {
                        Circle()
                            .fill(Color(hex: 0x2ECC71))
                            .frame(width: size * 0.26, height: size * 0.26)
                            .overlay(Circle().stroke(Theme.background, lineWidth: 2.5))
                    }
                }
        } else {
            AvatarView(path: nil, size: size)
        }
    }

    @ViewBuilder private var groupPicture: some View {
        if let emoji = conversation.emoji, !emoji.isEmpty {
            Text(emoji)
                .font(.system(size: size * 0.48))
                .frame(width: size, height: size)
                .background(Circle().fill(Theme.auraGradient.opacity(0.35)))
                .background(Circle().fill(Theme.surface))
        } else {
            let small = size * 0.7
            ZStack(alignment: .topLeading) {
                AvatarView(account: conversation.members.first, size: small)
                AvatarView(account: conversation.members.dropFirst().first, size: small)
                    .padding(2)
                    .background(Circle().fill(Theme.background))
                    .offset(x: size - small - 2, y: size - small - 2)
            }
            .frame(width: size, height: size, alignment: .topLeading)
        }
    }
}
