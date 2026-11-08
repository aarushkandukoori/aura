import SwiftUI

/// A rounded pill for picking things: interests, Explore topics, pronouns, how you know your friends.
/// Selected pills are filled with the accent color.
///
///     Button { toggle() } label: { ChipLabel(title: "🎧 music", isSelected: picked) }
///         .buttonStyle(.plain)
struct ChipLabel: View {
    let title: String
    var isSelected = false
    var height: CGFloat = 36

    var body: some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 14)
            .frame(height: height)
            .foregroundStyle(isSelected ? Color.white : Theme.text)
            .background(isSelected ? Theme.accent : Theme.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(isSelected ? Color.clear : Theme.border, lineWidth: 1))
            .contentShape(Capsule())
            .animation(.snappy(duration: 0.2), value: isSelected)
    }
}

/// Lays its children out left to right and starts a new line when a row is full, like words in a
/// paragraph. Used for the interest chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(subviews, maxWidth: proposal.width ?? .infinity).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let points = arrange(subviews, maxWidth: bounds.width).points
        for (subview, point) in zip(subviews, points) {
            subview.place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    /// Where each child goes (top-left corners) and how big the whole thing ends up.
    private func arrange(_ subviews: Subviews, maxWidth: CGFloat) -> (points: [CGPoint], size: CGSize) {
        var points: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth { // no room left on this row: wrap
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return (points, CGSize(width: widest, height: y + rowHeight))
    }
}
