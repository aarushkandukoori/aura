import PhotosUI
import SwiftUI

/// Make a story: pick a photo, add text (choose its color and style, drag it up or down), share.
/// Shown full screen from the stories row's "+" and the Create tab's "Story" switch.
struct StoryComposerView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var pickerItem: PhotosPickerItem?
    @State private var showsPicker = false
    @State private var photo: UIImage?
    @State private var isLoadingPhoto = false

    @State private var text = ""
    @State private var colorHex = StoryTextPalette.colors[0]
    @State private var style = StoryTextStyle.plain
    /// Where the text sits: 0 = top, 1 = bottom.
    @State private var textY = 0.5
    @State private var textYAtDragStart: Double?
    @State private var isEditingText = false
    @FocusState private var textFieldFocused: Bool

    @State private var isSharing = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let photo {
                editor(photo)
                    .ignoresSafeArea(.keyboard)
                if isEditingText {
                    textEditor
                }
            } else {
                emptyState
            }
        }
        .statusBarHidden()
        .photosPicker(isPresented: $showsPicker, selection: $pickerItem, matching: .images)
        .onChange(of: pickerItem) { Task { await loadPhoto() } }
        .task { if photo == nil { showsPicker = true } } // open the library right away
    }

    // MARK: - No photo yet

    private var emptyState: some View {
        VStack(spacing: 18) {
            HStack {
                closeButton
                Spacer()
            }
            Spacer()
            if isLoadingPhoto {
                ProgressView().tint(.white).controlSize(.large)
            } else {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(.white.opacity(0.85))
                Text("Share a moment")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                Text("Stories stay up for 24 hours.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
                Button("Choose a photo") { showsPicker = true }
                    .buttonStyle(.aura(.primary, size: .large))
                    .padding(.top, 6)
            }
            Spacer()
        }
        .padding(16)
    }

    // MARK: - Editing

    private func editor(_ photo: UIImage) -> some View {
        VStack(spacing: 10) {
            GeometryReader { geometry in
                ZStack {
                    Image(uiImage: photo)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .clipped()
                    if !trimmedText.isEmpty && !isEditingText {
                        StoryOverlayLabel(overlay: overlay, maxWidth: geometry.size.width * 0.84)
                            .gesture(moveText(height: geometry.size.height))
                            .onTapGesture { startEditing() }
                            .position(x: geometry.size.width / 2, y: geometry.size.height * textY)
                    }
                    if !isEditingText {
                        topBar
                            .frame(maxHeight: .infinity, alignment: .top)
                    }
                }
            }
            .aspectRatio(9 / 16, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            bottomBar
                .frame(height: 46)
                .padding(.horizontal, 12)
                .opacity(isEditingText ? 0 : 1)
        }
        .padding(.bottom, 4)
    }

    private var topBar: some View {
        HStack {
            closeButton
            Spacer()
            Button { startEditing() } label: {
                Text("Aa")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.black.opacity(0.35), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add text")
            Button { showsPicker = true } label: {
                Image(systemName: "photo")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.black.opacity(0.35), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Change photo")
        }
        .padding(12)
    }

    private var closeButton: some View {
        Button { dismiss() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.black.opacity(0.35), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close")
    }

    private var bottomBar: some View {
        HStack(spacing: 12) {
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(2)
            }
            Spacer()
            Button(action: share) {
                HStack(spacing: 8) {
                    if isSharing {
                        ProgressView().tint(.black)
                    } else {
                        AvatarView(path: store.me?.avatar, size: 26)
                    }
                    Text("Your story")
                        .font(.subheadline.weight(.semibold))
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.bold))
                }
                .foregroundStyle(.black)
                .padding(.leading, 8)
                .padding(.trailing, 14)
                .frame(height: 42)
                .background(.white, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isSharing)
        }
    }

    /// Typing the text: the photo dims, the field sits in the middle, colors ride above the keyboard.
    private var textEditor: some View {
        ZStack {
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture { finishEditing() }
            VStack(spacing: 0) {
                HStack {
                    Button { style = style.next } label: {
                        Image(systemName: style.symbol)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(.white.opacity(0.18), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Text style")
                    Spacer()
                    Button { finishEditing() } label: {
                        Text("Done")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(16)
                Spacer()
                // A hidden copy of the text decides the size, so the pill hugs the words while typing;
                // the real field sits on top of it.
                Text(text.isEmpty ? "Type something " : text + " ")
                    .font(Self.textFont)
                    .multilineTextAlignment(.center)
                    .hidden()
                    .overlay {
                        TextField("Type something", text: $text, axis: .vertical)
                            .font(Self.textFont)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(Color(css: overlay.color) ?? .white)
                            .tint(.white)
                            .focused($textFieldFocused)
                    }
                    .padding(.horizontal, style == .plain ? 0 : 12)
                    .padding(.vertical, style == .plain ? 0 : 7)
                    .background(Color(css: overlay.background) ?? .clear,
                                in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .padding(.horizontal, 40)
                Spacer()
                colorSwatches
                    .padding(.bottom, 10)
            }
        }
        .transition(.opacity)
    }

    private var colorSwatches: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(StoryTextPalette.colors, id: \.self) { hex in
                    Button { colorHex = hex } label: {
                        Circle()
                            .fill(Color(css: hex) ?? .white)
                            .frame(width: 28, height: 28)
                            .overlay(Circle().strokeBorder(.white, lineWidth: hex == colorHex ? 3 : 1.5))
                            .scaleEffect(hex == colorHex ? 1.15 : 1)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Text color")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
        .animation(.snappy, value: colorHex)
    }

    // MARK: - Text

    /// The same look StoryOverlayLabel uses, so typing looks like the finished story.
    private static let textFont = Font.system(size: 22, weight: .bold, design: .rounded)

    private var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The text as the server stores it (and as everyone's story viewer will draw it).
    private var overlay: StoryOverlay {
        switch style {
        case .plain:
            StoryOverlay(text: trimmedText, color: colorHex, background: nil, y: textY)
        case .dark:
            StoryOverlay(text: trimmedText, color: colorHex, background: "rgba(0,0,0,0.45)", y: textY)
        case .solid:
            StoryOverlay(text: trimmedText, color: StoryTextPalette.readableText(on: colorHex), background: colorHex, y: textY)
        }
    }

    private func startEditing() {
        withAnimation(.easeOut(duration: 0.2)) { isEditingText = true }
        textFieldFocused = true
    }

    private func finishEditing() {
        textFieldFocused = false
        withAnimation(.easeOut(duration: 0.2)) { isEditingText = false }
    }

    /// Drag the text up or down (it stays centered left to right).
    private func moveText(height: CGFloat) -> some Gesture {
        DragGesture()
            .onChanged { value in
                let start = textYAtDragStart ?? textY
                textYAtDragStart = start
                textY = min(max(start + value.translation.height / max(height, 1), 0.08), 0.92)
            }
            .onEnded { _ in textYAtDragStart = nil }
    }

    // MARK: - Photo and sharing

    private func loadPhoto() async {
        guard let pickerItem else { return }
        isLoadingPhoto = true
        defer { isLoadingPhoto = false }
        guard let data = try? await pickerItem.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            errorMessage = "Couldn't open that photo."
            return
        }
        errorMessage = nil
        photo = await Task.detached(priority: .userInitiated) {
            Uploader.resize(image, maxSide: Uploader.maxImageSide)
        }.value
    }

    private func share() {
        guard let photo, !isSharing else { return }
        isSharing = true
        errorMessage = nil
        let storyOverlay = trimmedText.isEmpty ? nil : overlay
        Task {
            do {
                let media = try await Uploader.uploadImage(photo)
                _ = try await store.createStory(CreateStoryRequest(media: media, overlay: storyOverlay))
                Haptics.success()
                store.showToast("Added to your story ✨")
                dismiss()
            } catch {
                if !error.isCancellation {
                    errorMessage = error.localizedDescription
                    Haptics.error()
                }
            }
            isSharing = false
        }
    }
}

/// How story text is drawn: plain, on a dark pill, or on a pill of the chosen color.
enum StoryTextStyle {
    case plain, dark, solid

    var next: StoryTextStyle {
        switch self {
        case .plain: .dark
        case .dark: .solid
        case .solid: .plain
        }
    }

    var symbol: String {
        switch self {
        case .plain: "textformat"
        case .dark: "a.square"
        case .solid: "a.square.fill"
        }
    }
}

/// The text colors for stories (white, ink, then the aura colors).
enum StoryTextPalette {
    static let colors = ["#ffffff", "#0e0e11", "#9b7bff", "#ff7ec7", "#ffc36b", "#5ce1b5", "#5bb8ff", "#ff3d6e"]

    /// White text on dark colors, ink on light ones.
    static func readableText(on hex: String) -> String {
        ["#ffffff", "#ffc36b", "#5ce1b5"].contains(hex) ? "#0e0e11" : "#ffffff"
    }
}
