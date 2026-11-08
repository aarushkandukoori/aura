import SwiftUI

// Small pieces of the reels screen.

/// Dark fades at the top and bottom so white text stays readable on bright pictures.
struct ReelScrims: View {
    var body: some View {
        VStack {
            LinearGradient(colors: [.black.opacity(0.45), .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: 150)
            Spacer()
            LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .top, endPoint: .bottom)
                .frame(height: 340)
        }
        .allowsHitTesting(false)
    }
}

/// A round dark badge with an icon in the middle of the screen (sound on/off, paused).
struct CenterIcon: View {
    let systemImage: String

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 26, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 72, height: 72)
            .background(.black.opacity(0.45), in: Circle())
            .allowsHitTesting(false)
    }
}

/// A big icon with a count under it, for the right side of a reel.
struct RailButton: View {
    let systemImage: String
    let count: Int?
    var tint: Color = .white
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.system(size: 27))
                    .foregroundStyle(tint)
                if let count {
                    CountText(value: count)
                        .font(.caption.weight(.semibold))
                }
            }
            .frame(minWidth: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityValue(count.map { Format.count($0) } ?? "")
    }
}

/// The thin bar at the bottom of a reel that fills up as it plays.
struct ReelProgressBar: View {
    /// 0...1
    let progress: Double

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle().fill(.white.opacity(0.25))
                Rectangle()
                    .fill(.white.opacity(0.9))
                    .frame(width: geometry.size.width * min(max(progress, 0), 1))
            }
        }
        .frame(height: 2)
        .allowsHitTesting(false)
    }
}

/// Text that scrolls sideways in a loop, like a song title on a car radio (the reel's audio name).
/// It only moves while its reel is playing.
struct MarqueeText: View {
    let text: String
    let isActive: Bool

    @State private var textWidth: CGFloat = 0

    private let gap: CGFloat = 36
    private let pointsPerSecond = 28.0

    var body: some View {
        // Color.clear takes exactly the space it's given; the moving text is drawn on top of it
        // and clipped to it.
        Color.clear
            .overlay(alignment: .leading) {
                TimelineView(.animation(paused: !isActive)) { timeline in
                    HStack(spacing: gap) {
                        label
                        label
                    }
                    .offset(x: -offset(at: timeline.date))
                }
            }
            .clipped()
            .accessibilityElement()
            .accessibilityLabel(text)
    }

    private var label: some View {
        Text(text)
            .font(.footnote.weight(.medium))
            .lineLimit(1)
            .fixedSize()
            .background {
                GeometryReader { geometry in
                    Color.clear.onAppear { textWidth = geometry.size.width }
                }
            }
    }

    /// How far the text has moved; after one text width plus the gap, the second copy is exactly
    /// where the first started, so the loop is seamless.
    private func offset(at date: Date) -> CGFloat {
        let cycle = Double(textWidth + gap)
        guard isActive, textWidth > 0 else { return 0 }
        return CGFloat((date.timeIntervalSinceReferenceDate * pointsPerSecond).truncatingRemainder(dividingBy: cycle))
    }
}

/// The author's picture as a little spinning record at the bottom of the right side.
struct AudioDisc: View {
    let account: Account
    let isSpinning: Bool

    var body: some View {
        TimelineView(.animation(paused: !isSpinning)) { timeline in
            AvatarView(account: account, size: 28)
                .rotationEffect(.degrees(isSpinning ? (timeline.date.timeIntervalSinceReferenceDate * 72)
                    .truncatingRemainder(dividingBy: 360) : 0))
        }
        .padding(4)
        .background(Circle().fill(.black.opacity(0.55)))
        .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
        .accessibilityHidden(true)
    }
}
