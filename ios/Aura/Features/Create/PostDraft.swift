import AVFoundation
import Observation
import PhotosUI
import SwiftUI

/// One photo or video picked for a new post, with how it will be cropped and filtered.
struct PickedMedia: Identifiable {
    let id = UUID()
    /// Where it came from in the picker (to keep the picker's order).
    let item: PhotosPickerItem
    /// The photo, or the video's first frame. At most 1440 px on its long side, already upright.
    let image: UIImage
    /// Set for a video (a copy in the temporary folder).
    var videoURL: URL?
    var filter: PhotoFilter = .original
    /// Where the crop frame sits (see PhotoEditing.crop). Starts centered.
    var focus = CGPoint(x: 0.5, y: 0.5)

    var isVideo: Bool { videoURL != nil }

    /// Loads a picker item: a video as a file plus its first frame, a photo as an image.
    static func load(_ item: PhotosPickerItem) async -> PickedMedia? {
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            guard let movie = try? await item.loadTransferable(type: PickedMovie.self),
                  let frame = try? await Uploader.posterFrame(of: AVURLAsset(url: movie.url)) else { return nil }
            return PickedMedia(item: item, image: await shrink(frame), videoURL: movie.url)
        }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else { return nil }
        return PickedMedia(item: item, image: await shrink(image))
    }

    /// Big camera photos are resized once, off the main thread, so editing stays quick.
    private static func shrink(_ image: UIImage) async -> UIImage {
        await Task.detached(priority: .userInitiated) {
            Uploader.resize(image, maxSide: Uploader.maxImageSide)
        }.value
    }
}

/// Everything about the post being made in the Create tab, from picking to sharing.
@Observable
@MainActor
final class PostDraft {
    /// What's selected in the photo picker, in the order it was picked.
    var selection: [PhotosPickerItem] = []
    /// The loaded photos/video for `selection`.
    private(set) var media: [PickedMedia] = []
    private(set) var isLoadingMedia = false

    var aspect = CropAspect.portrait
    /// The photo being edited in the edit step.
    var editingIndex = 0
    var caption = ""
    var location = ""
    var tagged: [Account] = []

    private(set) var isSharing = false
    private(set) var shareStatus = ""
    var errorMessage: String?

    var isVideo: Bool { media.first?.isVideo ?? false }

    /// A post is up to 10 photos, or one video on its own.
    var selectionProblem: String? {
        let hasVideo = selection.contains { item in item.supportedContentTypes.contains { $0.conforms(to: .movie) } }
        return hasVideo && selection.count > 1 ? "A video is posted on its own. Pick one video, or up to 10 photos." : nil
    }

    var canContinue: Bool {
        !media.isEmpty && media.count == selection.count && selectionProblem == nil && !isLoadingMedia
    }

    /// The crop shape for every photo (a carousel shares the first photo's shape).
    var cropRatio: CGFloat { aspect.ratio(for: media.first?.image) }

    // MARK: - Picking

    /// Loads newly picked items and drops unpicked ones, keeping the picker's order.
    func loadSelection() async {
        let items = selection
        isLoadingMedia = true
        var loaded: [PickedMedia] = []
        for item in items {
            if let existing = media.first(where: { $0.item == item }) {
                loaded.append(existing)
            } else if let fresh = await PickedMedia.load(item) {
                loaded.append(fresh)
            }
        }
        // The selection changed while loading: the newer call will finish the job.
        guard items == selection else { return }
        media = loaded
        editingIndex = min(editingIndex, max(media.count - 1, 0))
        isLoadingMedia = false
        if loaded.count < items.count { errorMessage = "Some items couldn't be opened." } else { errorMessage = nil }
    }

    func setFilter(_ filter: PhotoFilter) {
        guard media.indices.contains(editingIndex) else { return }
        media[editingIndex].filter = filter
    }

    func setFocus(_ focus: CGPoint, at index: Int) {
        guard media.indices.contains(index) else { return }
        media[index].focus = focus
    }

    // MARK: - Sharing

    /// Crops and filters the photos, uploads everything and publishes the post.
    /// Returns true when the post is live.
    func share(using store: AppStore) async -> Bool {
        guard !media.isEmpty, !isSharing else { return false }
        isSharing = true
        errorMessage = nil
        defer { isSharing = false }
        do {
            var uploaded: [Media] = []
            if let videoURL = media.first?.videoURL {
                shareStatus = "Uploading your video…"
                uploaded.append(try await Uploader.uploadVideo(at: videoURL))
            } else {
                let ratio = cropRatio
                for (number, item) in media.enumerated() {
                    shareStatus = media.count > 1 ? "Uploading \(number + 1) of \(media.count)…" : "Uploading…"
                    let finished = await Task.detached(priority: .userInitiated) {
                        PhotoEditing.render(item.image, ratio: ratio, focus: item.focus, filter: item.filter)
                    }.value
                    uploaded.append(try await Uploader.uploadImage(finished))
                }
            }
            shareStatus = "Sharing…"
            let place = location.trimmingCharacters(in: .whitespacesAndNewlines)
            let request = CreatePostRequest(
                kind: isVideo ? .reel : (uploaded.count > 1 ? .carousel : .photo),
                media: uploaded,
                caption: caption.trimmingCharacters(in: .whitespacesAndNewlines),
                location: place.isEmpty ? nil : place,
                taggedIds: tagged.map(\.id)
            )
            _ = try await store.createPost(request)
            return true
        } catch {
            if !error.isCancellation { errorMessage = error.localizedDescription }
            return false
        }
    }
}
