import SwiftUI

/// Instagram's little activity bubble: when new likes, comments or follows come in, a small bubble
/// drops in under the activity heart with a count of each, stays a few seconds, then floats back up.
///
/// It hangs below the view it's attached to. HomeTopBar puts it under the heart:
///
///     heartIcon.overlay(alignment: .bottom) { ActivityBubble() }
struct ActivityBubble: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var isShowing = false
    @State private var lastShownAt = Date.distantPast
    @State private var hideTask: Task<Void, Never>?
    @State private var bubbleWidth: CGFloat = 0

    /// How long the bubble stays out.
    private static let visibleFor = 4.0
    /// It comes back at most this often, however busy things get.
    private static let cooldown = 20.0
    /// How far the bubble may reach to the right of the heart. The heart sits 85 pt from the screen's
    /// right edge in the top bar, so this keeps a small margin.
    private static let reachRight: CGFloat = 74

    /// A wide bubble slides left to stay on screen; its point slides right by the same amount, so it
    /// still points at the heart.
    private var shift: CGFloat { max(0, bubbleWidth / 2 - Self.reachRight) }

    var body: some View {
        let counts = ActivityCounts(store.notifications)
        ZStack {
            if isShowing && !counts.isEmpty {
                bubble(counts)
                    .transition(reduceMotion ? .opacity : .activityBubble)
            }
        }
        .animation(Motion.pop.orFade(reduceMotion), value: isShowing)
        .animation(Motion.snap, value: counts)
        .fixedSize()
        // Hang just below the view it's attached to instead of covering it.
        .alignmentGuide(.bottom) { $0[.top] - 6 }
        .accessibilityHidden(true) // the heart already says how many are new
        .onChange(of: store.badges.notifications) { old, new in
            if new > old { show() }
        }
        .task {
            // Opening the app (or coming back to Home) with unread activity shows it once too.
            try? await Task.sleep(for: .seconds(0.8))
            show()
        }
    }

    private func bubble(_ counts: ActivityCounts) -> some View {
        HStack(spacing: 11) {
            if counts.likes > 0 { item("heart.fill", counts.likes) }
            if counts.comments > 0 { item("bubble.left.fill", counts.comments) }
            if counts.follows > 0 { item("person.fill", counts.follows) }
        }
        .fixedSize()
        .foregroundStyle(.white)
        .padding(.horizontal, 11)
        .frame(height: 34)
        .background(Theme.like, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { bubbleWidth = $0 }
        .overlay(alignment: .top) {
            BubbleTip()
                .fill(Theme.like)
                .frame(width: 14, height: 7)
                .offset(x: shift, y: -6.5)
        }
        .offset(x: -shift)
        .shadow(color: .black.opacity(0.16), radius: 10, y: 5)
    }

    private func item(_ symbol: String, _ count: Int) -> some View {
        HStack(spacing: 4) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .bold))
            Text(Self.short(count))
                .font(.system(size: 14, weight: .semibold))
                .contentTransition(.numericText(value: Double(count)))
        }
    }

    /// Short enough for the bubble: 999, then 1K, 3.9K, 41.2K, 1.2M.
    private static func short(_ count: Int) -> String {
        guard count >= 1_000, count < 10_000 else { return Format.count(count) }
        let tenths = count / 100 // 3,902 -> 39 (rounded down, like every count in the app)
        return tenths % 10 == 0 ? "\(tenths / 10)K" : "\(tenths / 10).\(tenths % 10)K"
    }

    /// Pops the bubble out for a few seconds, unless it's out already or was out a moment ago.
    private func show() {
        guard !isShowing, !ActivityCounts(store.notifications).isEmpty,
              Date.now.timeIntervalSince(lastShownAt) > Self.cooldown else { return }
        isShowing = true
        lastShownAt = .now
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(Self.visibleFor))
            if !Task.isCancelled { isShowing = false }
        }
    }
}

/// The unread activity in the bubble. A merged notification ("maya and 12 others liked your post")
/// counts everyone in it.
struct ActivityCounts: Equatable {
    var likes = 0
    var comments = 0
    var follows = 0

    var isEmpty: Bool { likes + comments + follows == 0 }

    init(_ notifications: [AuraNotification]) {
        for notification in notifications where !notification.read {
            let people = 1 + max(0, notification.others)
            switch notification.kind {
            case .like, .commentLike, .storyReaction: likes += people
            case .comment, .reply, .mention, .tag: comments += people
            case .follow: follows += people
            case .milestone: break
            }
        }
    }
}

/// The little point on top of the bubble, aimed at the heart.
private struct BubbleTip: Shape {
    func path(in rect: CGRect) -> Path {
        // Two gentle curves meeting at the top make a softened triangle.
        let bend = rect.width * 0.12
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.midX, y: rect.minY), control: CGPoint(x: rect.midX - bend, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.maxY), control: CGPoint(x: rect.midX + bend, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

private extension AnyTransition {
    /// Drops out of the heart with a springy pop, and floats back up into it.
    static var activityBubble: AnyTransition {
        .asymmetric(
            insertion: .scale(scale: 0.2, anchor: .top).combined(with: .opacity),
            removal: .scale(scale: 0.5, anchor: .top).combined(with: .opacity).combined(with: .offset(y: -10))
        )
    }
}
