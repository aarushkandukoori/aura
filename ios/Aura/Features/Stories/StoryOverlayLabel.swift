import SwiftUI

/// The text drawn over a story ("dinner is served 💀"), in its color, on its pill if it has one.
/// The caller places it (StoryOverlay.y is the vertical position, 0 = top, 1 = bottom).
struct StoryOverlayLabel: View {
    let overlay: StoryOverlay
    var maxWidth: CGFloat = 320

    var body: some View {
        let background = Color(css: overlay.background)
        Text(overlay.text ?? "")
            .font(.system(size: 22, weight: .bold, design: .rounded))
            .multilineTextAlignment(.center)
            .foregroundStyle(Color(css: overlay.color) ?? .white)
            .padding(.horizontal, background == nil ? 0 : 12)
            .padding(.vertical, background == nil ? 0 : 7)
            .background(background ?? .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            // Plain text gets a soft shadow so it reads on bright photos.
            .shadow(color: .black.opacity(background == nil ? 0.45 : 0), radius: 4, y: 1)
            .frame(maxWidth: maxWidth)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The thin bars at the top of the story viewer: full for watched stories, filling for the current one.
struct StoryProgressBars: View {
    let count: Int
    let index: Int
    /// 0...1 of the current story.
    let progress: Double

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<count, id: \.self) { bar in
                GeometryReader { geometry in
                    Capsule()
                        .fill(.white.opacity(0.35))
                        .overlay(alignment: .leading) {
                            Capsule()
                                .fill(.white)
                                .frame(width: geometry.size.width * fill(for: bar))
                        }
                }
                .frame(height: 2.5)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Story \(index + 1) of \(count)")
    }

    private func fill(for bar: Int) -> Double {
        if bar < index { return 1 }
        if bar > index { return 0 }
        return min(max(progress, 0), 1)
    }
}
