import SwiftUI

/// A post's pictures: one photo, a swipeable carousel, a reel preview or a video.
///
/// Double-tap likes the post with Instagram's big heart. A single tap on a reel opens it in the Reels
/// tab; on a photo with tagged people it shows who is tagged. After saving, a "Saved" bar slides up
/// over the bottom edge for a moment.
struct PostMediaView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let post: Post
    /// The carousel photo on screen (PostCellView shares it with the dots in the action row).
    @Binding var page: Int
    /// Goes up each time the post is saved from its action row: the "Saved" bar slides up.
    var savedBarTrigger = 0

    @State private var hearts = 0           // HeartBurst plays each time this goes up
    @State private var showsTags = false
    @State private var showsPageCounter = true
    @State private var showsSavedBar = false

    var body: some View {
        content
            .frame(maxWidth: .infinity)
            .aspectRatio(post.feedAspectRatio, contentMode: .fit)
            .clipped()
            .contentShape(Rectangle())
            .overlay { if showsTags { tagLabels } }
            .overlay(alignment: .topTrailing) { topBadge }
            .overlay(alignment: .bottomLeading) { bottomBadge }
            .overlay { HeartBurst(trigger: hearts) }
            .overlay(alignment: .bottom) { savedBar }
            // The double tap must come first so a single tap waits to see if a second one follows.
            .onTapGesture(count: 2) {
                hearts += 1
                store.like(post.id)
            }
            .onTapGesture { singleTap() }
            .task(id: page) { await flashPageCounter() }
            .task(id: savedBarTrigger) { await flashSavedBar() }
            .onChange(of: post.savedByMe) { _, saved in
                if !saved { withAnimation(Motion.slide.orFade(reduceMotion)) { showsSavedBar = false } }
            }
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

    /// The "Saved" bar, clipped to the photo so it slides up from under its bottom edge.
    private var savedBar: some View {
        ZStack(alignment: .bottom) {
            if showsSavedBar {
                SavedBar(thumbnail: post.thumbnail)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .clipped()
    }

    // MARK: - Taps and timers

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

    /// Slides the "Saved" bar up for three seconds after a save.
    private func flashSavedBar() async {
        guard savedBarTrigger > 0 else { return } // not when the post first appears
        withAnimation(Motion.slide.orFade(reduceMotion)) { showsSavedBar = true }
        try? await Task.sleep(for: .seconds(3))
        guard !Task.isCancelled else { return }
        withAnimation(Motion.slide.orFade(reduceMotion)) { showsSavedBar = false }
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
