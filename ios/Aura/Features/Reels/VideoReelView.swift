import AVFoundation
import SwiftUI

/// Plays a video reel: fills the screen, loops, and plays only while it is the reel on screen.
/// The poster picture shows until the first video frame is ready.
struct VideoReelView: View {
    let media: Media
    let isActive: Bool
    let isPaused: Bool
    let isMuted: Bool
    /// Room to leave under the progress bar (the tab bar).
    let progressInset: CGFloat

    @State private var player: AVQueuePlayer?
    /// Keeps the video looping (it must stay alive as long as the player).
    @State private var looper: AVPlayerLooper?
    @State private var timeObserver: Any?
    @State private var progress = 0.0

    var body: some View {
        ZStack {
            RemoteImage(path: media.thumbnail)
            if let player {
                ReelPlayerLayer(player: player)
            }
        }
        .clipped()
        .overlay(alignment: .bottom) {
            ReelProgressBar(progress: progress)
                .padding(.bottom, progressInset)
        }
        .onAppear(perform: setUp)
        .onDisappear(perform: tearDown)
        .onChange(of: isActive) { _, active in
            if !active { player?.seek(to: .zero) } // start from the top next time
            updatePlayback()
        }
        .onChange(of: isPaused) { updatePlayback() }
        .onChange(of: isMuted) { _, muted in
            player?.isMuted = muted
            // Turning the sound on is a request to hear it, even with the ring switch on silent.
            if !muted { try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback) }
        }
    }

    private func setUp() {
        guard player == nil, let url = API.mediaURL(media.url) else { return }
        let queue = AVQueuePlayer()
        looper = AVPlayerLooper(player: queue, templateItem: AVPlayerItem(url: url))
        queue.isMuted = isMuted
        // Ten times a second, move the progress bar.
        timeObserver = queue.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.1, preferredTimescale: 600),
                                                     queue: .main) { time in
            guard let duration = queue.currentItem?.duration.seconds, duration.isFinite, duration > 0 else { return }
            progress = time.seconds / duration
        }
        player = queue
        updatePlayback()
    }

    private func tearDown() {
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        player?.pause()
        timeObserver = nil
        looper = nil
        player = nil
        progress = 0
    }

    private func updatePlayback() {
        if isActive && !isPaused {
            player?.play()
        } else {
            player?.pause()
        }
    }
}

/// Shows an AVPlayer's picture filling its frame, with no playback controls.
private struct ReelPlayerLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerUIView {
        let view = PlayerUIView()
        view.playerLayer.videoGravity = .resizeAspectFill
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ view: PlayerUIView, context: Context) {
        view.playerLayer.player = player
    }

    /// A plain UIView whose backing layer is an AVPlayerLayer.
    final class PlayerUIView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
