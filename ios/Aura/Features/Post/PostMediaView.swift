import SwiftUI

/// A post's pictures: one photo, a swipeable carousel (with dots), a reel preview or a video.
///
/// Double-tap likes the post with a heart burst. A single tap on a reel opens it in the Reels tab;
/// on a photo with tagged people it shows who is tagged.
struct PostMediaView: View {
    @Environment(AppStore.self) private var store
    let post: Post

    @State private var page = 0             // the carousel photo on screen
    @State private var hearts = 0           // HeartBurst plays each time this goes up
    @State private var showsTags = false
    @State private var showsPageCounter = true

    var body: some View {
        content
            .frame(maxWidth: .infinity)
            .aspectRatio(post.feedAspectRatio, contentMode: .fit)
            .clipped()
            .contentShape(Rectangle())
            .overlay { if showsTags { tagLabels } }
            .overlay(alignment: .topTrailing) { topBadge }
            .overlay(alignment: .bottomLeading) { bottomBadge }
            .overlay(alignment: .bottom) {
                if post.media.count > 1 && !post.isReel {
                    CarouselDots(count: post.media.count, current: page)
                        .padding(.bottom, 12)
                }
            }
            .overlay { HeartBurst(trigger: hearts) }
            // The double tap must come first so a single tap waits to see if a second one follows.
            .onTapGesture(count: 2) {
                hearts += 1
                store.like(post.id)
            }
            .onTapGesture { singleTap() }
            .task(id: page) { await flashPageCounter() }
    }

    @ViewBuilder private var content: some View {
        if post.isReel {
            ReelPreview(post: post)
        } else if post.media.count > 1 {
            TabView(selection: $page) {
                ForEach(Array(post.media.enumerated()), id: \.offset) { index, media in
                    MediaItemView(media: media)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
        } else if let media = post.media.first {
            MediaItemView(media: media)
        } else {
            ImagePlaceholder(seed: post.id)
        }
    }

    // MARK: - Badges

    @ViewBuilder private var topBadge: some View {
        if post.isReel {
            Image(systemName: "play.square.stack.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.4), radius: 4)
                .padding(12)
                .accessibilityLabel("Reel")
        } else if post.media.count > 1 && showsPageCounter {
            Text("\(page + 1)/\(post.media.count)")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(.white)
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(.black.opacity(0.55), in: Capsule())
                .padding(12)
                .transition(.opacity)
        }
    }

    @ViewBuilder private var bottomBadge: some View {
        if post.isReel {
            Label(post.audio ?? "Original audio", systemImage: "music.note")
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.black.opacity(0.45), in: Capsule())
                .padding(12)
        } else if !post.tagged.isEmpty {
            Image(systemName: "person.fill")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(.black.opacity(0.6), in: Circle())
                .padding(12)
                .accessibilityLabel("Tagged people")
        }
    }

    /// The usernames of tagged people, shown after a tap on the photo.
    private var tagLabels: some View {
        VStack(spacing: 8) {
            ForEach(post.tagged) { account in
                NavigationLink(value: Route.profile(account.username)) {
                    Text(account.username)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(.black.opacity(0.7), in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .transition(.opacity.combined(with: .scale(scale: 0.9)))
    }

    // MARK: - Taps

    private func singleTap() {
        if post.isReel {
            store.show([.reel(post.id)], in: .reels)
        } else if !post.tagged.isEmpty {
            withAnimation(.snappy) { showsTags.toggle() }
        }
    }

    /// Shows "2/5" for a moment whenever the carousel moves, like a quiet hint that there's more.
    private func flashPageCounter() async {
        guard post.media.count > 1, !post.isReel else { return }
        withAnimation(.easeOut(duration: 0.2)) { showsPageCounter = true }
        try? await Task.sleep(for: .seconds(2.5))
        guard !Task.isCancelled else { return }
        withAnimation(.easeOut(duration: 0.4)) { showsPageCounter = false }
    }
}

/// The little dots on a carousel's photo. The current one is solid white.
struct CarouselDots: View {
    let count: Int
    let current: Int

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<count, id: \.self) { index in
                Circle()
                    .fill(.white.opacity(index == current ? 1 : 0.5))
                    .frame(width: 6, height: 6)
                    .scaleEffect(index == current ? 1.2 : 1)
            }
        }
        .shadow(color: .black.opacity(0.35), radius: 3)
        .animation(.snappy, value: current)
        .accessibilityElement()
        .accessibilityLabel("Photo \(current + 1) of \(count)")
    }
}

/// One photo or video of a post, filling its frame.
struct MediaItemView: View {
    let media: Media

    var body: some View {
        if media.isVideo {
            LoopingVideoView(media: media)
        } else {
            RemoteImage(path: media.url)
        }
    }
}
