import PhotosUI
import SwiftUI

/// The bar at the bottom of a chat: a photo button, a text field that grows up to five lines,
/// and send (or a quick ❤️ when the field is empty). While typing, a row of quick emoji sits on
/// top; a reply chip and a photo preview appear above the field when there's one.
struct ChatComposer: View {
    @Environment(AppStore.self) private var store
    let conversationId: String
    @Binding var replyingTo: Message?
    var isFocused: FocusState<Bool>.Binding

    @State private var text = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var photo: PickedPhoto?

    /// A photo picked from the library: shown right away, uploaded in the background.
    private struct PickedPhoto {
        var preview: UIImage
        var media: Media? // set when the upload is done
    }

    static let quickEmoji = ["❤️", "😂", "🔥", "😍", "👏", "😭", "🙌", "😮"]

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isUploading: Bool { photo != nil && photo?.media == nil }
    private var canSend: Bool {
        if let photo { return photo.media != nil }
        return !trimmed.isEmpty
    }

    var body: some View {
        VStack(spacing: 8) {
            if isFocused.wrappedValue {
                emojiRow
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if let replyingTo {
                replyChip(replyingTo)
            }
            if let photo {
                photoPreview(photo)
            }
            HStack(alignment: .bottom, spacing: 8) {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Image(systemName: "photo")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Theme.accent, in: Circle())
                }
                .accessibilityLabel("Send a photo")
                TextField("Message...", text: $text, axis: .vertical)
                    .font(.body)
                    .lineLimit(1...5)
                    .focused(isFocused)
                    .padding(.vertical, 7)
                    .frame(minHeight: 34)
                trailingButton
            }
            .padding(5)
            .background(Theme.secondaryFill, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(Theme.background)
        .animation(.snappy(duration: 0.22), value: isFocused.wrappedValue)
        .animation(.snappy(duration: 0.22), value: replyingTo?.id)
        .animation(.snappy(duration: 0.22), value: photo == nil)
        .onChange(of: photoItem) { _, item in
            if let item { Task { await loadPhoto(item) } }
        }
    }

    // MARK: - Parts

    @ViewBuilder private var trailingButton: some View {
        if canSend {
            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(Theme.accent, in: Circle())
            }
            .accessibilityLabel("Send")
            .transition(.scale.combined(with: .opacity))
        } else if isUploading {
            ProgressView()
                .frame(width: 34, height: 34)
        } else {
            Button {
                sendRightAway("❤️")
            } label: {
                Image(systemName: "heart")
                    .font(.system(size: 20))
                    .foregroundStyle(Theme.text)
                    .frame(width: 34, height: 34)
            }
            .accessibilityLabel("Send a heart")
        }
    }

    /// Tap one: sent as its own message when the field is empty, added to the text otherwise.
    private var emojiRow: some View {
        HStack(spacing: 0) {
            ForEach(Self.quickEmoji, id: \.self) { emoji in
                Button {
                    if trimmed.isEmpty && photo == nil {
                        sendRightAway(emoji)
                    } else {
                        text += emoji
                    }
                } label: {
                    Text(emoji)
                        .font(.system(size: 26))
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func replyChip(_ message: Message) -> some View {
        HStack(spacing: 10) {
            Capsule()
                .fill(Theme.accent)
                .frame(width: 3, height: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(message.isMine ? "Replying to yourself" : "Replying to \(MessagePreview.firstName(message.sender))")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.text)
                Text(MessagePreview.summary(of: message))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Button {
                replyingTo = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cancel reply")
        }
        .padding(.horizontal, 6)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func photoPreview(_ photo: PickedPhoto) -> some View {
        HStack {
            Image(uiImage: photo.preview)
                .resizable()
                .scaledToFill()
                .frame(width: 76, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay {
                    if photo.media == nil {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(.black.opacity(0.35))
                            .overlay(ProgressView().tint(.white))
                    }
                }
                .overlay(alignment: .topTrailing) {
                    Button {
                        clearPhoto()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 22, height: 22)
                            .background(.black.opacity(0.65), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .offset(x: 7, y: -7)
                    .accessibilityLabel("Remove photo")
                }
            Spacer()
        }
        .padding(.top, 6)
        .padding(.horizontal, 4)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Sending

    private func send() {
        guard canSend else { return }
        let body = trimmed
        let media = photo?.media
        let reply = replyingTo
        text = ""
        clearPhoto()
        replyingTo = nil
        deliver(text: body, media: media, replyTo: reply)
    }

    /// The quick heart and the emoji row: send one emoji now (as a reply if a reply is open).
    private func sendRightAway(_ emoji: String) {
        let reply = replyingTo
        replyingTo = nil
        deliver(text: emoji, media: nil, replyTo: reply)
    }

    /// The chat scrolls to my new message by itself when it shows up.
    private func deliver(text: String, media: Media?, replyTo: Message?) {
        Haptics.tap()
        Task { await store.sendMessage(to: conversationId, text: text, media: media, replyTo: replyTo) }
    }

    // MARK: - Photos

    private func loadPhoto(_ item: PhotosPickerItem) async {
        do {
            guard let data = try await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                throw APIError(message: "That photo couldn't be opened.")
            }
            photo = PickedPhoto(preview: image)
            let media = try await Uploader.uploadImage(image)
            // Only keep it if this is still the picked photo (not removed or replaced meanwhile).
            if photoItem == item { photo?.media = media }
        } catch {
            if photoItem == item { clearPhoto() }
            if !error.isCancellation { store.showToast(error.localizedDescription) }
        }
    }

    private func clearPhoto() {
        photo = nil
        photoItem = nil
    }
}
