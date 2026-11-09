import SwiftUI

/// The full-screen story viewer. MainTabView shows it while `store.storyViewer` is set.
///
/// It grows out of the avatar you tapped and shrinks back into it when it closes (StoryZoom knows
/// where the avatars are). Each person's stories are one page (StoryPage): swipe sideways to turn to
/// the next person (the pages turn like the sides of a cube, following your finger) and drag down to
/// close (the story shrinks with your finger and flies back into the avatar). Replies, reactions and
/// my viewers sheet are handled here, above the pages.
struct StoryViewer: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let trays: [StoryTray]
    let startIndex: Int

    /// The page on screen (the scroll view keeps it in sync while swiping).
    @State private var currentTray: Int?
    /// 0 = shrunk into the avatar, 1 = full size. It animates when the viewer opens and closes.
    @State private var zoom: Double
    /// The avatar the story grows out of or shrinks into (window coordinates). nil = no zoom.
    @State private var zoomFrame: CGRect?
    /// The whole viewer's opacity, for fading in and out when there's no avatar to zoom with.
    @State private var opacity: Double
    /// How far a drag-down has pulled the story (it follows the finger).
    @State private var drag: CGSize = .zero
    /// Which way the current drag went at first: down closes, sideways turns the pages.
    @State private var dragAxis: Axis?
    @State private var isDraggingDown = false
    @State private var isClosing = false
    /// A finger is on the story (dragging sideways or down): the story holds still meanwhile.
    @GestureState private var isTouching = false
    /// The viewer's frame on screen, to tell whether an avatar is visible when closing.
    @State private var screen: CGRect = .zero
    @State private var replyingTo: Story?
    @State private var viewersOf: Story?
    @State private var burst: Burst?
    @State private var note: String?

    /// One quick reaction flying out (a new id replays the animation for the same emoji).
    private struct Burst: Equatable {
        let id = UUID()
        let emoji: String
    }

    init(trays: [StoryTray], startIndex: Int) {
        self.trays = trays
        self.startIndex = startIndex
        _currentTray = State(initialValue: startIndex)
        // Opened from an avatar: start shrunk into it (or invisible with Reduce Motion) and grow on
        // appear. Opened any other way, the cover already slid up the usual way.
        let frame = StoryZoom.shared.takeOpenFrame()
        let zooms = frame != nil && !UIAccessibility.isReduceMotionEnabled
        _zoomFrame = State(initialValue: zooms ? frame : nil)
        _zoom = State(initialValue: zooms ? 0 : 1)
        _opacity = State(initialValue: frame != nil && !zooms ? 0 : 1)
    }

    var body: some View {
        ZStack {
            Color.black
                .opacity(backdropOpacity)
                .ignoresSafeArea()

            GeometryReader { geometry in
                pages(size: geometry.size)
                    .modifier(StoryCardTransform(card: geometry.frame(in: .global), avatar: zoomFrame,
                                                 zoom: zoom, drag: drag))
            }
            .simultaneousGesture(dismissDrag)
            .ignoresSafeArea(.keyboard) // the story stays put while typing a reply

            if let burst {
                EmojiBurst(emoji: burst.emoji)
                    .id(burst.id)
                    .ignoresSafeArea(.keyboard) // stays put while the keyboard goes down
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
        .opacity(opacity)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { screen = $0 }
        .animation(.easeOut(duration: 0.25), value: note)
        .animation(.easeOut(duration: 0.2), value: replyingTo?.id)
        .onAppear(perform: grow)
        .onChange(of: currentTray, initial: true) { _, index in
            // The stories row keeps this person's face in view, so closing can shrink into it.
            if let index, trays.indices.contains(index) {
                StoryZoom.shared.currentAuthorId = trays[index].author.id
            }
        }
        .onChange(of: isTouching) { _, touching in
            if !touching { settleCancelledDrag() }
        }
        .onDisappear { StoryZoom.shared.viewerClosed() }
        .sheet(item: $viewersOf) { story in
            StoryViewersSheet(story: story)
                .environment(store)
        }
        .statusBarHidden()
        // See-through, so the app shows behind the story while it zooms or is dragged down.
        .presentationBackground(.clear)
    }

    private func pages(size: CGSize) -> some View {
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
                              onShowViewers: { story in viewersOf = story },
                              onClose: close)
                        .frame(width: size.width, height: size.height)
                        .visualEffect { content, proxy in
                            content.storyCubeTurn(proxy.frame(in: .scrollView(axis: .horizontal)))
                        }
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $currentTray)
        .scrollIndicators(.hidden)
        .scrollDisabled(replyingTo != nil || isDraggingDown || isClosing)
    }

    /// The black behind the story: fades in as it grows, and lets the app show through as it's dragged.
    private var backdropOpacity: Double {
        zoom * (1 - 0.85 * StoryCardTransform.dragProgress(drag))
    }

    private var isPaused: Bool { isTouching || isClosing || replyingTo != nil || viewersOf != nil }

    // MARK: - Opening and closing

    /// Grows out of the avatar (or fades in) right after appearing.
    private func grow() {
        if zoom < 1 { withAnimation(Motion.zoom) { zoom = 1 } }
        if opacity < 1 { withAnimation(Motion.fade) { opacity = 1 } }
    }

    /// Shrinks back into the avatar of whoever's story is showing (or fades out when their avatar
    /// isn't on screen), then removes the viewer without the cover's own slide.
    private func close() {
        guard !isClosing else { return }
        isClosing = true
        replyingTo = nil
        let authorId = currentTray.flatMap { trays.indices.contains($0) ? trays[$0].author.id : nil }
        let avatar = reduceMotion ? nil : authorId.flatMap { StoryZoom.shared.closeFrame(for: $0, in: screen) }
        if let avatar {
            zoomFrame = avatar
            withAnimation(Motion.zoom) {
                zoom = 0
                drag = .zero
            } completion: { finishClosing() }
        } else {
            withAnimation(.easeOut(duration: 0.22)) {
                opacity = 0
                if !reduceMotion { drag.height += 140 }
            } completion: { finishClosing() }
        }
    }

    private func finishClosing() {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { store.closeStories() }
    }

    // MARK: - Moving between people

    /// Turns to another person's stories, or closes after the last one.
    private func show(_ index: Int) {
        guard trays.indices.contains(index) else {
            if index >= trays.count { close() }
            return
        }
        withAnimation(.easeInOut(duration: 0.45)) { currentTray = index }
    }

    // MARK: - Dragging down to close

    private var dismissDrag: some Gesture {
        DragGesture(minimumDistance: 12)
            .updating($isTouching) { _, touching, _ in touching = true }
            .onChanged { value in
                if dragAxis == nil {
                    // Decided once per drag: mostly downward closes, anything else turns the pages.
                    let isDown = value.translation.height > abs(value.translation.width)
                    dragAxis = isDown ? .vertical : .horizontal
                    isDraggingDown = isDown && replyingTo == nil && !isClosing
                }
                if isDraggingDown { drag = value.translation }
            }
            .onEnded { value in
                dragAxis = nil
                guard isDraggingDown else { return }
                isDraggingDown = false
                if value.translation.height > 110 || value.predictedEndTranslation.height > 420 {
                    close()
                } else {
                    withAnimation(Motion.snap) { drag = .zero }
                }
            }
    }

    /// A drag that was cancelled instead of ended never reaches onEnded: put the story back. This runs
    /// a moment after the finger lifts, so a normal onEnded has always gone first.
    private func settleCancelledDrag() {
        Task {
            guard dragAxis != nil else { return }
            dragAxis = nil
            if isDraggingDown {
                isDraggingDown = false
                withAnimation(Motion.snap) { drag = .zero }
            }
        }
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
        let current = Burst(emoji: emoji)
        burst = current
        Haptics.like()
        Task {
            do {
                try await API.reactToStory(story.id, emoji: emoji)
            } catch {
                if !error.isCancellation { showNote(error.localizedDescription) }
            }
        }
        Task {
            try? await Task.sleep(for: .seconds(1.4))
            if burst == current { burst = nil }
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

/// Moves the story card for the zoom and the drag-down. At `zoom` 0 the card is a circle the size of
/// the avatar, sitting on it; at 1 it fills its space. A drag moves it with the finger, shrinks it and
/// rounds its corners. Animatable, so the circle opens into the card smoothly frame by frame.
private struct StoryCardTransform: ViewModifier, Animatable {
    /// Where the card sits at full size (window coordinates).
    let card: CGRect
    /// The avatar to grow out of or shrink into (window coordinates).
    let avatar: CGRect?
    var zoom: Double
    var drag: CGSize

    var animatableData: AnimatablePair<Double, AnimatablePair<CGFloat, CGFloat>> {
        get { AnimatablePair(zoom, AnimatablePair(drag.width, drag.height)) }
        set {
            zoom = newValue.first
            drag = CGSize(width: newValue.second.first, height: newValue.second.second)
        }
    }

    /// 0 at rest, 1 when dragged far down.
    static func dragProgress(_ drag: CGSize) -> Double {
        min(max(drag.height / 520, 0), 1)
    }

    func body(content: Content) -> some View {
        let pulled = Self.dragProgress(drag)
        let dragScale = 1 - 0.35 * pulled
        let width = max(card.width, 1)
        // Growing out of the avatar: start at its size and spot, as a circle.
        let startScale = avatar.map { $0.width / width } ?? 1
        let startOffset = avatar.map { CGSize(width: $0.midX - card.midX, height: $0.midY - card.midY) } ?? .zero
        let scale = lerp(startScale, 1, zoom) * dragScale
        let maskHeight = avatar == nil ? card.height : lerp(width, card.height, zoom)
        // Corners: a full circle at the avatar, rounding in as the story is dragged (kept the same
        // size on screen, so divided by the scale).
        let dragCorner = 34 * pulled / max(scale, 0.1)
        let corner = avatar == nil ? dragCorner : lerp(width / 2, dragCorner, zoom)
        return content
            .mask {
                RoundedRectangle(cornerRadius: corner, style: .continuous)
                    .frame(width: width, height: maskHeight)
            }
            .scaleEffect(scale)
            .offset(x: lerp(startOffset.width, 0, zoom) + drag.width,
                    y: lerp(startOffset.height, 0, zoom) + drag.height)
    }

    private func lerp(_ from: Double, _ to: Double, _ amount: Double) -> Double {
        from + (to - from) * amount
    }
}

private extension VisualEffect {
    /// The cube turn between people: as a page slides out it swings around the edge it shares with
    /// its neighbour and darkens, like the sides of a turning cube. `frame` is the page's frame in
    /// the scroll view.
    func storyCubeTurn(_ frame: CGRect) -> some VisualEffect {
        let progress = min(max(frame.minX / max(frame.width, 1), -1), 1)
        return rotation3DEffect(.degrees(progress * 90), axis: (x: 0, y: 1, z: 0),
                                anchor: progress > 0 ? .leading : .trailing, perspective: 0.55)
            .brightness(-abs(progress) * 0.4)
    }
}
