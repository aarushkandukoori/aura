import AVFoundation
import SwiftUI
import UIKit

/// A muted video that loops while it's on screen, filling its frame like a photo.
/// The poster frame shows underneath until the video starts.
struct LoopingVideoView: View {
    let media: Media

    /// Made when the view appears (not on every redraw of the cell around it).
    @State private var player: LoopingPlayer?

    var body: some View {
        ZStack {
            RemoteImage(path: media.poster)
            if let player {
                PlayerLayerView(player: player.queue)
            }
        }
        .onAppear {
            guard let url = API.mediaURL(media.url) else { return }
            let player = player ?? LoopingPlayer(url: url)
            self.player = player
            player.queue.play()
        }
        .onDisappear { player?.queue.pause() }
    }
}

/// Keeps a video playing on repeat: AVPlayerLooper refills the queue player with the same clip.
@MainActor
final class LoopingPlayer {
    let queue: AVQueuePlayer
    private let looper: AVPlayerLooper

    init(url: URL) {
        let queue = AVQueuePlayer()
        queue.isMuted = true
        self.queue = queue
        looper = AVPlayerLooper(player: queue, templateItem: AVPlayerItem(url: url))
    }
}

/// Shows an AVPlayer's picture, scaled to fill (cropping the edges) like photos do.
struct PlayerLayerView: UIViewRepresentable {
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

    /// A UIView whose layer is an AVPlayerLayer, so the video resizes with the view.
    final class PlayerUIView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
