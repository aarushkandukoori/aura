import SwiftUI

/// Step 2 of a new post (photos only): pick the crop shape, drag each photo to frame it, and give
/// it a filter. With several photos, tap a thumbnail to edit that one.
struct MediaEditStep: View {
    @Bindable var draft: PostDraft

    /// The photo being edited, with its filter applied (made off the main thread).
    @State private var filteredPreview: UIImage?
    /// Small previews of every filter for the photo being edited.
    @State private var filterThumbnails: [PhotoFilter: UIImage] = [:]

    var body: some View {
        VStack(spacing: 12) {
            Picker("Crop", selection: $draft.aspect) {
                ForEach(CropAspect.allCases) { aspect in
                    Text(aspect.rawValue).tag(aspect)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)

            // The photo takes whatever room the strips leave, in the chosen shape.
            GeometryReader { space in
                if let item = current {
                    let size = canvasSize(in: space.size)
                    CropCanvas(image: filteredPreview ?? item.image,
                               focus: Binding(get: { item.focus },
                                              set: { draft.setFocus($0, at: draft.editingIndex) }))
                        .frame(width: size.width, height: size.height)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .animation(.snappy, value: size)
                }
            }
            Text("Drag the photo to frame it")
                .font(.caption)
                .foregroundStyle(Theme.muted)

            if draft.media.count > 1 {
                photoStrip
            }
            filterStrip
        }
        .padding(.vertical, 12)
        .task(id: previewKey) { await makePreview() }
        .task(id: current?.id) { await makeThumbnails() }
    }

    /// The biggest frame of the crop shape that fits in the space.
    private func canvasSize(in space: CGSize) -> CGSize {
        let ratio = draft.cropRatio
        let width = min(space.width, space.height * ratio)
        return CGSize(width: width, height: width / ratio)
    }

    private var current: PickedMedia? {
        draft.media.indices.contains(draft.editingIndex) ? draft.media[draft.editingIndex] : nil
    }

    // MARK: - Strips

    /// Thumbnails of every picked photo; the one being edited has an accent border.
    private var photoStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(draft.media.enumerated()), id: \.element.id) { index, item in
                    Button { draft.editingIndex = index } label: {
                        Image(uiImage: item.image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 52, height: 52)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .strokeBorder(index == draft.editingIndex ? Theme.accent : .clear, lineWidth: 2.5)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Edit photo \(index + 1)")
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var filterStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(PhotoFilter.allCases) { filter in
                    let isSelected = current?.filter == filter
                    Button {
                        draft.setFilter(filter)
                        Haptics.selection()
                    } label: {
                        VStack(spacing: 6) {
                            Text(filter.name)
                                .font(.caption.weight(isSelected ? .bold : .regular))
                                .foregroundStyle(isSelected ? Theme.text : Theme.muted)
                            Group {
                                if let thumbnail = filterThumbnails[filter] ?? current?.image {
                                    Image(uiImage: thumbnail)
                                        .resizable()
                                        .scaledToFill()
                                } else {
                                    Theme.surface
                                }
                            }
                            .frame(width: 76, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .strokeBorder(isSelected ? Theme.accent : .clear, lineWidth: 2.5)
                            )
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Making previews

    private var previewKey: String {
        guard let current else { return "" }
        return "\(current.id)-\(current.filter.rawValue)"
    }

    private func makePreview() async {
        guard let item = current else { return }
        if item.filter == .original {
            filteredPreview = nil
            return
        }
        let image = item.image
        let filter = item.filter
        let result = await Task.detached(priority: .userInitiated) { filter.apply(to: image) }.value
        if !Task.isCancelled { filteredPreview = result }
    }

    private func makeThumbnails() async {
        guard let item = current else { return }
        filterThumbnails = [:]
        let image = item.image
        let thumbnails = await Task.detached(priority: .utility) {
            let small = Uploader.resize(image, maxSide: 240)
            var result: [PhotoFilter: UIImage] = [:]
            for filter in PhotoFilter.allCases { result[filter] = filter.apply(to: small) }
            return result
        }.value
        if !Task.isCancelled { filterThumbnails = thumbnails }
    }
}

/// A photo filling its crop frame (give it the frame's size). Drag it to choose which part is
/// kept; a grid shows while dragging.
struct CropCanvas: View {
    let image: UIImage
    @Binding var focus: CGPoint

    @State private var focusAtDragStart: CGPoint?

    var body: some View {
        GeometryReader { geometry in
            let frame = geometry.size
            let shown = filledSize(of: image.size, in: frame)
            // How much of the photo hangs outside the frame on each side.
            let overflow = CGSize(width: shown.width - frame.width, height: shown.height - frame.height)
            Image(uiImage: image)
                .resizable()
                .frame(width: shown.width, height: shown.height)
                .offset(x: (0.5 - focus.x) * overflow.width, y: (0.5 - focus.y) * overflow.height)
                .frame(width: frame.width, height: frame.height)
                .clipped()
                .overlay { if focusAtDragStart != nil { ThirdsGrid() } }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            let start = focusAtDragStart ?? focus
                            focusAtDragStart = start
                            focus = CGPoint(
                                x: clamp(start.x - value.translation.width / max(overflow.width, 1)),
                                y: clamp(start.y - value.translation.height / max(overflow.height, 1))
                            )
                        }
                        .onEnded { _ in focusAtDragStart = nil }
                )
        }
    }

    /// The size of the image when scaled to cover the whole frame.
    private func filledSize(of size: CGSize, in frame: CGSize) -> CGSize {
        guard size.width > 0, size.height > 0 else { return frame }
        let scale = max(frame.width / size.width, frame.height / size.height)
        return CGSize(width: size.width * scale, height: size.height * scale)
    }

    private func clamp(_ value: CGFloat) -> CGFloat { min(max(value, 0), 1) }
}

/// Rule-of-thirds lines over the crop while dragging.
private struct ThirdsGrid: View {
    var body: some View {
        GeometryReader { geometry in
            Path { path in
                for step in 1...2 {
                    let x = geometry.size.width * CGFloat(step) / 3
                    let y = geometry.size.height * CGFloat(step) / 3
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: geometry.size.height))
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: geometry.size.width, y: y))
                }
            }
            .stroke(.white.opacity(0.6), lineWidth: 0.5)
        }
        .allowsHitTesting(false)
    }
}
