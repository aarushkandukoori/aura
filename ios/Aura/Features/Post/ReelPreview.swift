import SwiftUI

/// A reel inside the feed. Video reels play muted on a loop. Photo reels (several frames) drift
/// slowly and cross-fade from frame to frame, a small taste of how they play in the Reels tab.
struct ReelPreview: View {
    let post: Post

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var frame = 0

    var body: some View {
        if let video = post.media.first(where: \.isVideo) {
            LoopingVideoView(media: video)
        } else {
            ZStack {
                DriftingImage(path: frameURL, drifts: !reduceMotion)
                    .id(frame) // a new view per frame, so each one fades in and starts its own drift
                    .transition(.opacity)
            }
            .task { await playFrames() }
        }
    }

    private var frameURL: String? {
        post.media.indices.contains(frame) ? post.media[frame].url : post.media.first?.url
    }

    /// Moves to the next frame every 2.5 seconds while the reel is on screen.
    private func playFrames() async {
        guard post.media.count > 1, !reduceMotion else { return }
        // Fetch every frame first so the cross-fades never show a loading shimmer.
        for media in post.media {
            if let url = API.mediaURL(media.url) { _ = try? await ImageLoader.shared.image(for: url) }
        }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(2.5))
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.7)) {
                frame = (frame + 1) % post.media.count
            }
        }
    }
}

/// A photo that slowly zooms in, the "Ken Burns" look of photo reels.
private struct DriftingImage: View {
    let path: String?
    let drifts: Bool

    @State private var zoomed = false

    var body: some View {
        RemoteImage(path: path)
            .scaleEffect(zoomed ? 1.08 : 1)
            .onAppear {
                guard drifts else { return }
                withAnimation(.linear(duration: 3.4)) { zoomed = true }
            }
    }
}
