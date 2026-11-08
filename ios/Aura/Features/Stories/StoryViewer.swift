import SwiftUI

/// The full-screen story viewer. MainTabView shows it while `store.storyViewer` is set.
///
/// Each person's stories are one page (StoryPage). Swipe sideways to move between people (pages
/// turn like the sides of a cube), swipe down to close. Replies, reactions and my viewers sheet
/// are handled here, above the pages.
struct StoryViewer: View {
    @Environment(AppStore.self) private var store
    let trays: [StoryTray]
    let startIndex: Int

    /// The page on screen (the scroll view keeps it in sync while swiping).
    @State private var currentTray: Int?
    /// How far the viewer is dragged down (to close it).
    @State private var dragOffset: CGFloat = 0
    /// A finger is dragging (sideways to the next person, or down to close): the story holds still.
    /// Gesture state resets by itself when the finger lifts, even if the drag gets cancelled.
    @GestureState private var isDragging = false
    @State private var replyingTo: Story?
    @State private var viewersOf: Story?
    @State private var burstEmoji: String?
    @State private var note: String?

    init(trays: [StoryTray], startIndex: Int) {
        self.trays = trays
        self.startIndex = startIndex
        _currentTray = State(initialValue: startIndex)
    }

    var body: some View {
        ZStack {
            Color.black
                .opacity(1 - dragProgress * 0.7)
                .ignoresSafeArea()

            pages
                .offset(y: dragOffset)
                .scaleEffect(1 - dragProgress * 0.1)
                .simultaneousGesture(dismissDrag)
                .ignoresSafeArea(.keyboard) // the story stays put while typing a reply

            if let burstEmoji {
                Text(burstEmoji)
                    .font(.system(size: 110))
                    .shadow(color: .black.opacity(0.25), radius: 12)
                    .transition(.scale(scale: 0.3).combined(with: .opacity))
                    .allowsHitTesting(false)
            }

            if let note {
                Text(note)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(.white, in: Capsule())
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .padding(.bottom, 80)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                    .allowsHitTesting(false)
            }

            if let replyingTo {
                StoryReplyOverlay(story: replyingTo,
                                  onSend: { text in reply(text, to: replyingTo) },
                                  onReact: { emoji in react(emoji, to: replyingTo) },
                                  onClose: { self.replyingTo = nil })
                    .transition(.opacity)
            }
        }
        .animation(.spring(duration: 0.35), value: burstEmoji)
        .animation(.easeOut(duration: 0.25), value: note)
        .animation(.easeOut(duration: 0.2), value: replyingTo?.id)
        .sheet(item: $viewersOf) { story in
            StoryViewersSheet(story: story)
                .environment(store)
        }
        .statusBarHidden()
        // See-through, so the app shows behind the story while it's dragged down.
        .presentationBackground(.clear)
    }

    private var pages: some View {
        GeometryReader { geometry in
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(trays.indices, id: \.self) { index in
                        StoryPage(tray: trays[index],
                                  isActive: currentTray == index,
                                  isPausedByViewer: isPaused,
                                  isReplying: replyingTo != nil && currentTray == index,
                                  hasPreviousTray: index > 0,
                                  onNextTray: { show(index + 1) },
                                  onPreviousTray: { show(index - 1) },
                                  onReply: { story in replyingTo = story },
                                  onReact: { emoji, story in react(emoji, to: story) },
                                  onShowViewers: { story in viewersOf = story })
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .visualEffect { content, proxy in
                                // The cube turn: a page swings around its edge as it slides out.
                                let width = max(proxy.size.width, 1)
                                let progress = min(max(proxy.frame(in: .scrollView(axis: .horizontal)).minX / width, -1), 1)
                                return content
                                    .rotation3DEffect(.degrees(progress * 70), axis: (x: 0, y: 1, z: 0),
                                                      anchor: progress > 0 ? .leading : .trailing, perspective: 0.6)
                                    .brightness(-abs(progress) * 0.35)
                            }
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentTray)
            .scrollIndicators(.hidden)
            .scrollDisabled(replyingTo != nil)
        }
    }

    // MARK: - Moving between people

    /// Turns to another person's stories, or closes after the last one.
    private func show(_ index: Int) {
        guard trays.indices.contains(index) else {
            if index >= trays.count { store.closeStories() }
            return
        }
        withAnimation(.easeInOut(duration: 0.45)) { currentTray = index }
    }

    // MARK: - Closing by dragging down

    private var isPaused: Bool { isDragging || replyingTo != nil || viewersOf != nil }

    /// 0 at rest, 1 when dragged far down.
    private var dragProgress: Double { min(max(dragOffset / 400, 0), 1) }

    private var dismissDrag: some Gesture {
        DragGesture(minimumDistance: 24)
            .updating($isDragging) { _, dragging, _ in dragging = true }
            .onChanged { value in
                if isDownward(value) { dragOffset = value.translation.height }
            }
            .onEnded { value in
                if isDownward(value) && (value.translation.height > 140 || value.predictedEndTranslation.height > 500) {
                    store.closeStories()
                } else {
                    withAnimation(.spring(duration: 0.3)) { dragOffset = 0 }
                }
            }
    }

    /// Only a mostly-downward drag moves the viewer. Sideways drags belong to the paging.
    private func isDownward(_ value: DragGesture.Value) -> Bool {
        value.translation.height > 0 && value.translation.height > abs(value.translation.width)
    }

    // MARK: - Replies and reactions

    private func reply(_ text: String, to story: Story) {
        replyingTo = nil
        Task {
            do {
                _ = try await API.replyToStory(story.id, text: text)
                Haptics.success()
                showNote("Message sent")
            } catch {
                if !error.isCancellation { showNote(error.localizedDescription) }
            }
        }
    }

    private func react(_ emoji: String, to story: Story) {
        replyingTo = nil
        burstEmoji = emoji
        Haptics.like()
        Task {
            do {
                try await API.reactToStory(story.id, emoji: emoji)
            } catch {
                if !error.isCancellation { showNote(error.localizedDescription) }
            }
        }
        Task {
            try? await Task.sleep(for: .seconds(0.9))
            if burstEmoji == emoji { burstEmoji = nil }
        }
    }

    private func showNote(_ text: String) {
        note = text
        Task {
            try? await Task.sleep(for: .seconds(1.8))
            if note == text { note = nil }
        }
    }
}
