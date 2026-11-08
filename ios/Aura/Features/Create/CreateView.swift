import SwiftUI

/// The Create tab: pick photos or a video, crop and filter them, write a caption, share.
///
/// The three steps swap inside this one screen instead of pushing new ones, so the half-made post
/// lives in one place (PostDraft). "Story" at the bottom opens the story composer instead.
struct CreateView: View {
    @Environment(AppStore.self) private var store

    private enum Step { case pick, edit, details }

    @State private var draft = PostDraft()
    @State private var step = Step.pick
    @State private var movingForward = true
    @State private var showsStoryComposer = false

    var body: some View {
        ZStack {
            switch step {
            case .pick:
                MediaPickStep(draft: draft) { showsStoryComposer = true }
                    .transition(stepTransition)
            case .edit:
                MediaEditStep(draft: draft)
                    .transition(stepTransition)
            case .details:
                PostDetailsStep(draft: draft) { finish() }
                    .transition(stepTransition)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .navigationBarBackButtonHidden(step != .pick)
        .fullScreenCover(isPresented: $showsStoryComposer) {
            StoryComposerView()
                .environment(store)
        }
    }

    private var title: String {
        switch step {
        case .pick: "New post"
        case .edit: "Edit"
        case .details: "New post"
        }
    }

    // MARK: - Moving between steps

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        switch step {
        case .pick:
            if !draft.selection.isEmpty {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Clear") { draft.selection = [] }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Next") { go(to: draft.isVideo ? .details : .edit, forward: true) }
                    .fontWeight(.semibold)
                    .disabled(!draft.canContinue)
            }
        case .edit:
            ToolbarItem(placement: .topBarLeading) {
                backButton { go(to: .pick, forward: false) }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Next") { go(to: .details, forward: true) }
                    .fontWeight(.semibold)
            }
        case .details:
            ToolbarItem(placement: .topBarLeading) {
                backButton { go(to: draft.isVideo ? .pick : .edit, forward: false) }
                    .disabled(draft.isSharing)
            }
        }
    }

    private func backButton(action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .fontWeight(.semibold)
        }
        .accessibilityLabel("Back")
    }

    /// Slides like a navigation push: forward comes in from the right, back from the left.
    private var stepTransition: AnyTransition {
        .asymmetric(insertion: .move(edge: movingForward ? .trailing : .leading),
                    removal: .move(edge: movingForward ? .leading : .trailing))
    }

    private func go(to next: Step, forward: Bool) {
        movingForward = forward
        withAnimation(.snappy(duration: 0.35)) { step = next }
    }

    /// The post is live: start a fresh draft and show it at the top of Home.
    private func finish() {
        Haptics.success()
        draft = PostDraft()
        step = .pick
        store.show([], in: .home)
        store.showToast("Your post is live ✨")
    }
}
