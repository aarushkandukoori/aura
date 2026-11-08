import SwiftUI

/// One reel filling the screen: the video or moving pictures, who posted it and the caption at the
/// bottom, and like / comment / share / save on the right.
///
/// Double-tap likes (a heart pops where you tapped). Tapping a video turns the sound on or off;
/// tapping a picture reel pauses it. Holding pauses either and hides the buttons.
struct ReelPage: View {
    @Environment(AppStore.self) private var store
    let post: Post
    let isActive: Bool
    /// The screen's safe area (status bar, tab bar), so text and buttons stay clear of them.
    let insets: EdgeInsets
    @Binding var isMuted: Bool
    /// Called once the reel has been on screen for two seconds.
    let onViewed: () -> Void

    @State private var isHeld = false
    @State private var pausedByTap = false
    @State private var hearts = 0
    @State private var heartSpot = CGPoint.zero
    @State private var soundTaps = 0
    @State private var captionOpen = false
    @State private var confirmingDelete = false

    private var isVideo: Bool { post.media.first?.isVideo ?? false }

    var body: some View {
        let current = store.post(post.id) ?? post
        ZStack {
            media(current)
            ReelScrims()
            overlay(current)
            HeartBurst(trigger: hearts, size: 110)
                .position(heartSpot)
            centerBadge
        }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { location in
            heartSpot = location
            hearts += 1
            store.like(current.id)
        }
        .onTapGesture {
            if isVideo {
                isMuted.toggle()
                soundTaps += 1
            } else {
                pausedByTap.toggle()
            }
        }
        .onLongPressGesture(minimumDuration: 0.25, maximumDistance: 24) {
            isHeld = true
        } onPressingChanged: { pressing in
            if !pressing { isHeld = false }
        }
        .task(id: isActive) {
            guard isActive else { return }
            try? await Task.sleep(for: .seconds(2))
            if !Task.isCancelled { onViewed() }
        }
        .onChange(of: isActive) { _, active in
            if !active {
                pausedByTap = false
                captionOpen = false
            }
        }
        .confirmationDialog("Delete this reel?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: - Pieces

    @ViewBuilder private func media(_ post: Post) -> some View {
        if let video = post.media.first, video.isVideo {
            VideoReelView(media: video, isActive: isActive, isPaused: isHeld, isMuted: isMuted,
                          progressInset: insets.bottom)
        } else {
            MotionReelView(frames: post.media, isActive: isActive, isPaused: isHeld || pausedByTap,
                           progressInset: insets.bottom)
        }
    }

    private func overlay(_ post: Post) -> some View {
        HStack(alignment: .bottom, spacing: 14) {
            ReelInfo(post: post, isActive: isActive, captionOpen: $captionOpen)
            ReelRail(post: post, isActive: isActive) { confirmingDelete = true }
        }
        .padding(.leading, 14)
        .padding(.trailing, 10)
        .padding(.bottom, insets.bottom + 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .opacity(isHeld ? 0 : 1)
        .animation(.easeInOut(duration: 0.2), value: isHeld)
    }

    /// The sound icon that flashes when you tap a video, or a play icon while a picture reel is paused.
    @ViewBuilder private var centerBadge: some View {
        if isVideo {
            CenterIcon(systemImage: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .keyframeAnimator(initialValue: 0.0, trigger: soundTaps) { icon, opacity in
                    icon.opacity(opacity)
                } keyframes: { _ in
                    LinearKeyframe(1, duration: 0.1)
                    LinearKeyframe(1, duration: 0.6)
                    LinearKeyframe(0, duration: 0.3)
                }
        } else if pausedByTap && !isHeld {
            CenterIcon(systemImage: "play.fill")
                .transition(.scale(scale: 0.8).combined(with: .opacity))
        }
    }

    private func delete() async {
        do {
            try await store.deletePost(post.id)
            store.showToast("Reel deleted")
        } catch {
            if !error.isCancellation { store.showToast(error.localizedDescription) }
        }
    }
}

/// Author, Follow, caption and the scrolling audio name, bottom left.
private struct ReelInfo: View {
    @Environment(AppStore.self) private var store
    let post: Post
    let isActive: Bool
    @Binding var captionOpen: Bool

    /// Whether to show Follow at all: only for people I didn't follow when the reel appeared, so
    /// the button can turn into "Following" after a tap instead of vanishing.
    @State private var offersFollow: Bool?

    var body: some View {
        let author = store.latest(post.author)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                AvatarView(account: post.author, size: 34, showsStoryRing: true) { openAuthor(author) }
                NavigationLink(value: Route.profile(author.username)) {
                    HStack(spacing: 4) {
                        Text(author.username)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        if author.verified { VerifiedBadge(size: 12) }
                    }
                }
                .buttonStyle(.plain)
                if offersFollow == true {
                    Button { store.toggleFollow(author) } label: {
                        Text(author.iFollow ? "Following" : "Follow")
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, 12)
                            .frame(height: 28)
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .strokeBorder(.white.opacity(0.85), lineWidth: 1))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }

            if !post.caption.isEmpty {
                Text(captionText)
                    .font(.subheadline)
                    .lineLimit(captionOpen ? 12 : 2)
                    .fixedSize(horizontal: false, vertical: true)
                    .onTapGesture { withAnimation(.snappy) { captionOpen.toggle() } }
            }

            if let audio = post.audio, !audio.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "music.note")
                        .font(.caption.weight(.semibold))
                    MarqueeText(text: audio, isActive: isActive)
                        .frame(width: 170, height: 18)
                }
                .padding(.horizontal, 10)
                .frame(height: 28)
                .background(.white.opacity(0.16), in: Capsule())
            }
        }
        .foregroundStyle(.white)
        .tint(.white) // @mentions and #tags in the caption stay readable on the video
        .shadow(color: .black.opacity(0.35), radius: 4, y: 1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear {
            if offersFollow == nil { offersFollow = !author.isMe && !author.iFollow }
        }
    }

    /// The caption, or its first words and "… more" while it's closed and long.
    private var captionText: AttributedString {
        let caption = post.caption
        guard !captionOpen, caption.count > 70 else { return Format.richText(caption) }
        // Cut between words so a @mention or #tag is never split in half.
        var preview = ""
        for word in caption.split(separator: " ") {
            if preview.count + word.count + 1 > 60 { break }
            preview += (preview.isEmpty ? "" : " ") + word
        }
        var more = AttributedString("… more")
        more.foregroundColor = .white.opacity(0.7)
        return Format.richText(preview) + more
    }

    /// Their story if they have one, otherwise their profile.
    private func openAuthor(_ author: Account) {
        if author.hasStory {
            Task { await store.openStories(for: author) }
        } else {
            store.navigate(to: .profile(author.username))
        }
    }
}

/// Like, comment, share, save, more and the spinning audio picture, down the right side.
private struct ReelRail: View {
    @Environment(AppStore.self) private var store
    let post: Post
    let isActive: Bool
    let onDelete: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            RailButton(systemImage: post.likedByMe ? "heart.fill" : "heart", count: post.likeCount,
                       tint: post.likedByMe ? Theme.like : .white, label: post.likedByMe ? "Unlike" : "Like") {
                store.toggleLike(post.id)
            }
            .symbolEffect(.bounce, value: post.likedByMe)

            RailButton(systemImage: "bubble.right", count: post.commentCount, label: "Comments") {
                store.showComments(postId: post.id)
            }

            RailButton(systemImage: "paperplane", count: post.shareCount, label: "Share") {
                store.showShareSheet(for: post)
            }

            RailButton(systemImage: post.savedByMe ? "bookmark.fill" : "bookmark", count: nil,
                       label: post.savedByMe ? "Remove from saved" : "Save") {
                store.toggleSave(post.id)
            }

            Menu {
                Button { store.navigate(to: .post(post.id)) } label: {
                    Label("View post", systemImage: "rectangle.portrait")
                }
                Button { store.navigate(to: .profile(post.author.username)) } label: {
                    Label("Go to @\(post.author.username)", systemImage: "person.crop.circle")
                }
                if post.author.isMe {
                    Button(role: .destructive, action: onDelete) {
                        Label("Delete", systemImage: "trash")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 22, weight: .semibold))
                    .frame(width: 44, height: 32)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("More")

            AudioDisc(account: post.author, isSpinning: isActive)
        }
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.35), radius: 4, y: 1)
    }
}
