import PhotosUI
import SwiftUI

/// Pick a profile photo: upload one from the photo library or tap one of the ready-made pictures.
/// Used by onboarding and Edit profile.
///
/// `path` is the chosen picture ("/media/uploads/..." or a preset path), nil = none yet.
/// `isUploading` is true while a photo is on its way to the server, so the screen can wait for it.
struct AvatarChooser: View {
    @Binding var path: String?
    @Binding var isUploading: Bool
    var previewSize: CGFloat = 128

    @State private var pickerItem: PhotosPickerItem?
    /// The picked photo, shown right away while it uploads (and after, so it never flickers).
    @State private var localImage: UIImage?
    @State private var presets: [String] = []
    @State private var errorMessage: String?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 14), count: 4)

    var body: some View {
        VStack(spacing: 18) {
            preview

            PhotosPicker(selection: $pickerItem, matching: .images) {
                Label("Upload a photo", systemImage: "photo.on.rectangle.angled")
            }
            .buttonStyle(.aura(.secondary))
            .disabled(isUploading)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Theme.like)
                    .multilineTextAlignment(.center)
            }

            if !presets.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Or pick one")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.muted)
                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(presets, id: \.self) { preset in
                            presetButton(preset)
                        }
                    }
                }
            }
        }
        .task {
            if presets.isEmpty { presets = (try? await API.avatars()) ?? [] }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await upload(item) }
        }
    }

    // MARK: - Pieces

    private var preview: some View {
        ZStack {
            Circle()
                .fill(Theme.ringGradient)
                .frame(width: previewSize + 40, height: previewSize + 40)
                .blur(radius: 30)
                .opacity(path == nil && localImage == nil ? 0 : 0.45)

            Group {
                if let localImage {
                    Image(uiImage: localImage).resizable().scaledToFill()
                } else if let path {
                    RemoteImage(path: path)
                } else {
                    DefaultAvatar()
                }
            }
            .frame(width: previewSize, height: previewSize)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(Theme.border, lineWidth: 1))
            .overlay {
                if isUploading {
                    Circle().fill(.black.opacity(0.35))
                    ProgressView().tint(.white)
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: path)
        .accessibilityLabel("Your profile photo")
    }

    private func presetButton(_ preset: String) -> some View {
        let isChosen = path == preset && localImage == nil
        return Button {
            Haptics.selection()
            localImage = nil
            errorMessage = nil
            path = preset
        } label: {
            RemoteImage(path: preset)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(Circle())
                .padding(isChosen ? 4 : 0)
                .overlay(Circle().strokeBorder(Theme.accent, lineWidth: isChosen ? 3 : 0))
                .animation(.snappy(duration: 0.2), value: isChosen)
        }
        .buttonStyle(.plain)
        .disabled(isUploading)
        .accessibilityLabel("Preset picture")
        .accessibilityAddTraits(isChosen ? .isSelected : [])
    }

    // MARK: - Uploading

    private func upload(_ item: PhotosPickerItem) async {
        isUploading = true
        errorMessage = nil
        defer {
            isUploading = false
            pickerItem = nil
        }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                throw APIError(message: "Couldn't open that photo.")
            }
            localImage = UIImage(data: data)
            let media = try await Uploader.uploadImage(data: data)
            path = media.url
        } catch {
            if error.isCancellation { return }
            localImage = nil
            errorMessage = error.localizedDescription
        }
    }
}
