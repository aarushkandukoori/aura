import SwiftUI

/// Instagram-style carousel dots, shown under a post's photos: the current photo's dot in the accent
/// color, the others gray. With more than five photos only five dots show at a time; the dots at the
/// edges shrink to say "there's more that way", and the row slides along as you swipe.
struct CarouselDots: View {
    let count: Int
    let current: Int

    private static let maxVisible = 5
    private let dot: CGFloat = 6
    private let spacing: CGFloat = 4

    var body: some View {
        let first = firstVisible
        let shown = min(count, Self.maxVisible)
        HStack(spacing: spacing) {
            ForEach(0..<count, id: \.self) { index in
                Circle()
                    .fill(index == current ? Theme.accent : Theme.muted.opacity(0.35))
                    .frame(width: dot, height: dot)
                    .scaleEffect(scale(of: index, first: first))
            }
        }
        .fixedSize()
        // Slide the row so the window of five dots is the part that shows.
        .offset(x: -CGFloat(first) * (dot + spacing))
        .frame(width: CGFloat(shown) * dot + CGFloat(shown - 1) * spacing, alignment: .leading)
        .clipped()
        .animation(Motion.snap, value: current)
        .accessibilityElement()
        .accessibilityLabel("Photo \(current + 1) of \(count)")
    }

    /// The first dot that shows: keeps the current one in the middle of the five when it can.
    private var firstVisible: Int {
        guard count > Self.maxVisible else { return 0 }
        return min(max(current - Self.maxVisible / 2, 0), count - Self.maxVisible)
    }

    /// Full size, except near an edge of the window when more dots wait beyond it.
    private func scale(of index: Int, first: Int) -> CGFloat {
        guard count > Self.maxVisible else { return 1 }
        let last = first + Self.maxVisible - 1
        let moreBefore = first > 0
        let moreAfter = last < count - 1
        if (index == first && moreBefore) || (index == last && moreAfter) { return 0.5 }
        if (index == first + 1 && moreBefore) || (index == last - 1 && moreAfter) { return 0.75 }
        return 1
    }
}
