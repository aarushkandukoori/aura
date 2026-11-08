import SwiftUI

/// Plays a reel made of still pictures like a short film: each picture slowly zooms and drifts for a
/// couple of seconds, then cross-fades into the next one, looping, with a thin progress bar.
///
/// Everything on screen is worked out from one number, the seconds played so far, so pausing is
/// just "stop the clock" and every frame is drawn from that time.
struct MotionReelView: View {
    let frames: [Media]
    let isActive: Bool
    let isPaused: Bool
    /// Room to leave under the progress bar (the tab bar).
    let progressInset: CGFloat

    static let secondsPerFrame = 2.6
    static let fadeSeconds = 0.7
    /// A single picture gently zooms in and out over this many seconds instead.
    static let singleLoopSeconds = 8.0

    /// Seconds played before the last pause.
    @State private var playedBefore = 0.0
    /// When playing last started (nil while paused).
    @State private var resumedAt: Date?

    private var isPlaying: Bool { isActive && !isPaused }

    var body: some View {
        TimelineView(.animation(paused: !isPlaying)) { timeline in
            let seconds = playedSeconds(at: timeline.date)
            ZStack {
                ForEach(frames.indices, id: \.self) { index in
                    let look = look(of: index, at: seconds)
                    RemoteImage(path: frames[index].url)
                        .scaleEffect(look.scale)
                        .offset(look.offset)
                        .opacity(look.opacity)
                        .zIndex(look.layer)
                }
            }
            .clipped()
            .overlay(alignment: .bottom) {
                ReelProgressBar(progress: progress(at: seconds))
                    .padding(.bottom, progressInset)
            }
        }
        .onChange(of: isPlaying, initial: true) { _, playing in
            if playing {
                resumedAt = Date()
            } else {
                if let resumedAt { playedBefore += Date().timeIntervalSince(resumedAt) }
                resumedAt = nil
            }
        }
        .onChange(of: isActive) { _, active in
            // Swiped away: start from the first picture next time.
            if !active {
                playedBefore = 0
                resumedAt = nil
            }
        }
    }

    private func playedSeconds(at date: Date) -> Double {
        playedBefore + (resumedAt.map { date.timeIntervalSince($0) } ?? 0)
    }

    // MARK: - The math

    /// How one picture looks at a moment: its zoom, drift, visibility and which one is on top.
    private struct Look {
        var scale = 1.0
        var offset = CGSize.zero
        var opacity = 0.0
        var layer = 0.0
    }

    private func look(of index: Int, at seconds: Double) -> Look {
        let count = frames.count
        if count <= 1 {
            // One picture: zoom in and back out smoothly (a cosine wave from 0 to 1 and back).
            let wave = (1 - cos(seconds / Self.singleLoopSeconds * 2 * .pi)) / 2
            return Look(scale: 1.04 + 0.1 * wave, offset: drift(index, wave), opacity: 1, layer: 1)
        }
        let slot = Self.secondsPerFrame
        let fade = Self.fadeSeconds
        let time = seconds.truncatingRemainder(dividingBy: slot * Double(count))
        let current = Int(time / slot) % count
        let intoSlot = time - Double(current) * slot   // 0 up to slot
        let fadeStart = slot - fade
        let next = (current + 1) % count

        // A picture keeps moving from the moment it starts fading in until it has faded out,
        // so its motion lasts one slot plus one fade.
        let motionLength = slot + fade
        if index == current {
            let progress = (intoSlot + fade) / motionLength
            return Look(scale: zoom(progress), offset: drift(index, progress), opacity: 1, layer: 1)
        }
        if index == next, intoSlot > fadeStart {
            let fadedIn = (intoSlot - fadeStart) / fade
            let progress = (intoSlot - fadeStart) / motionLength
            return Look(scale: zoom(progress), offset: drift(index, progress), opacity: fadedIn, layer: 2)
        }
        return Look()
    }

    /// Slowly zooms in from 104% to 116%.
    private func zoom(_ progress: Double) -> Double {
        1.04 + 0.12 * progress
    }

    /// Drifts a little, in a different direction for each picture.
    private func drift(_ index: Int, _ progress: Double) -> CGSize {
        let sideways: Double = index.isMultiple(of: 2) ? -14 : 14
        let upDown: Double = index % 3 == 0 ? -10 : 10
        return CGSize(width: sideways * progress, height: upDown * progress)
    }

    /// How far through the whole reel we are, for the progress bar.
    private func progress(at seconds: Double) -> Double {
        let length = frames.count <= 1 ? Self.singleLoopSeconds : Self.secondsPerFrame * Double(frames.count)
        return seconds.truncatingRemainder(dividingBy: length) / length
    }
}
