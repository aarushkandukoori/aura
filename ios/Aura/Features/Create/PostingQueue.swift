import Observation
import SwiftUI

/// The post being shared right now. The Create tab hands its draft over and goes straight back to
/// Home, where PostingRow shows the first photo and a progress bar while the post uploads (like
/// Instagram's "Posting…" row). When it's live the row tucks away and HomeView slides the new post
/// in at the top of the feed. If it fails, the row offers Retry.
@Observable
@MainActor
final class PostingQueue {
    static let shared = PostingQueue()

    enum Phase: Equatable {
        case posting
        case done
        case failed(String)
    }

    /// The post being shared (nil = nothing to show).
    private(set) var draft: PostDraft?
    private(set) var phase = Phase.posting

    /// True while the row should show (HomeView holds the new post back until it's gone).
    var isActive: Bool { draft != nil }

    /// 0...1 for the row's progress bar.
    var progress: Double { phase == .done ? 1 : (draft?.shareProgress ?? 0) }

    /// The first photo (or the video's first frame) for the row.
    var thumbnail: UIImage? { draft?.media.first?.image }

    /// Starts sharing a finished draft.
    func share(_ draft: PostDraft, using store: AppStore) {
        guard self.draft == nil else { return } // one at a time (Create waits while one is going)
        self.draft = draft
        run(using: store)
    }

    func retry(using store: AppStore) {
        run(using: store)
    }

    /// Gives up on a failed post.
    func discard() {
        draft = nil
    }

    private func run(using store: AppStore) {
        guard let draft else { return }
        phase = .posting
        Task {
            if await draft.share(using: store) {
                phase = .done
                Haptics.success()
                // Let the bar reach the end and the row say "Done" before it tucks away.
                try? await Task.sleep(for: .seconds(0.7))
                self.draft = nil
            } else {
                phase = .failed(draft.errorMessage ?? "Your post couldn't be shared.")
                Haptics.error()
            }
        }
    }
}
