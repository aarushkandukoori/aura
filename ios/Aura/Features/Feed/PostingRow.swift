import SwiftUI

/// The row at the top of the feed while my new post uploads, like Instagram's: the first photo, how
/// it's going, and a progress bar along the bottom edge. When something goes wrong it offers Retry
/// (and an X to give up). HomeView shows it while `PostingQueue.shared.isActive`.
struct PostingRow: View {
    @Environment(AppStore.self) private var store
    let queue: PostingQueue

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                thumbnail
                Text(status)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isFailed ? Theme.like : Theme.text)
                    .contentTransition(.opacity)
                    .lineLimit(2)
                Spacer(minLength: 8)
                trailing
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .animation(.easeInOut(duration: 0.2), value: status)

            ProgressLine(progress: queue.progress, isFailed: isFailed)
        }
        .background(Theme.background)
        .accessibilityElement(children: .contain)
    }

    private var isFailed: Bool {
        if case .failed = queue.phase { return true }
        return false
    }

    private var status: String {
        switch queue.phase {
        case .posting: queue.progress > 0.8 ? "Finishing up…" : "Posting…"
        case .done: "Done"
        case .failed: "Couldn't share. Try again?"
        }
    }

    private var thumbnail: some View {
        Group {
            if let image = queue.thumbnail {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Theme.surface
            }
        }
        .frame(width: 42, height: 42)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        // Dim the picture until the post is live, like the real thing.
        .opacity(queue.phase == .done ? 1 : 0.7)
    }

    @ViewBuilder private var trailing: some View {
        switch queue.phase {
        case .posting:
            EmptyView()
        case .done:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 20))
                .foregroundStyle(Theme.accent)
                .transition(.scale(scale: 0.4).combined(with: .opacity))
        case .failed:
            HStack(spacing: 4) {
                Button { queue.retry(using: store) } label: {
                    Image(systemName: "arrow.clockwise")
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Try again")
                Button { queue.discard() } label: {
                    Image(systemName: "xmark")
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Discard post")
            }
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.text)
            .buttonStyle(.plain)
        }
    }
}

/// The thin bar under the row. It eases toward each step's end (an upload can take a moment), then
/// runs quickly to the end when the post is live.
private struct ProgressLine: View {
    let progress: Double
    let isFailed: Bool

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme.border)
                Rectangle()
                    .fill(isFailed ? AnyShapeStyle(Theme.like) : AnyShapeStyle(Theme.auraGradient))
                    .frame(width: geometry.size.width * min(max(progress, 0), 1))
            }
        }
        .frame(height: 2.5)
        .animation(progress >= 1 ? .easeOut(duration: 0.3) : .easeOut(duration: 1.6), value: progress)
    }
}
