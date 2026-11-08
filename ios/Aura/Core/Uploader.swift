import AVFoundation
import CoreTransferable
import UIKit
import UniformTypeIdentifiers

/// Gets photos and videos onto the server and returns the `Media` to put in a post, story or message.
///
///     let media = try await Uploader.uploadImage(image)              // a UIImage
///     let media = try await Uploader.uploadImage(data: data)         // bytes from PhotosPicker
///     let movie = try await item.loadTransferable(type: PickedMovie.self)
///     let media = try await Uploader.uploadVideo(at: movie!.url)     // video + poster frame
enum Uploader {
    /// Photos are shrunk so their long side is at most this many pixels.
    static let maxImageSide: CGFloat = 1440
    static let jpegQuality: CGFloat = 0.86

    /// Resizes to max 1440 px, encodes JPEG (quality 0.86) and uploads it.
    static func uploadImage(_ image: UIImage) async throws -> Media {
        let resized = resize(image, maxSide: maxImageSide)
        guard let data = resized.jpegData(compressionQuality: jpegQuality) else {
            throw APIError(message: "Couldn't prepare that photo.")
        }
        let width = Int(resized.size.width * resized.scale)
        let height = Int(resized.size.height * resized.scale)
        let uploaded = try await API.upload(data, contentType: "image/jpeg", width: width, height: height)
        return Media(url: uploaded.url, type: .image, width: uploaded.width ?? width, height: uploaded.height ?? height)
    }

    /// For PhotosPicker: `let data = try await item.loadTransferable(type: Data.self)`. Reads HEIC, JPEG, PNG...
    static func uploadImage(data: Data) async throws -> Media {
        guard let image = UIImage(data: data) else {
            throw APIError(message: "That file isn't a photo Aura can read.")
        }
        return try await uploadImage(image)
    }

    /// Uploads the video as it is, plus a still frame as its poster (for grids and for the AI to "see" it).
    static func uploadVideo(at fileURL: URL) async throws -> Media {
        let asset = AVURLAsset(url: fileURL)
        let size = try await videoSize(of: asset)
        let poster = try await uploadImage(posterFrame(of: asset))
        let contentType = fileURL.pathExtension.lowercased() == "mov" ? "video/quicktime" : "video/mp4"
        let uploaded = try await API.upload(fileAt: fileURL, contentType: contentType,
                                            width: Int(size.width), height: Int(size.height))
        return Media(url: uploaded.url, type: .video,
                     width: uploaded.width ?? Int(size.width), height: uploaded.height ?? Int(size.height),
                     poster: poster.url)
    }

    /// Redraws the image at most `maxSide` pixels on its long side. Redrawing also bakes in the
    /// orientation, so photos straight from the camera don't come out sideways.
    static func resize(_ image: UIImage, maxSide: CGFloat) -> UIImage {
        let pixelWidth = image.size.width * image.scale
        let pixelHeight = image.size.height * image.scale
        let scale = min(1, maxSide / max(pixelWidth, pixelHeight, 1))
        let target = CGSize(width: (pixelWidth * scale).rounded(), height: (pixelHeight * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1 // one point = one pixel, so `target` is the real pixel size
        format.opaque = true
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    /// The video's display size (width and height swapped for portrait clips).
    static func videoSize(of asset: AVAsset) async throws -> CGSize {
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw APIError(message: "That video has no picture.")
        }
        let (naturalSize, transform) = try await track.load(.naturalSize, .preferredTransform)
        let size = naturalSize.applying(transform)
        return CGSize(width: abs(size.width), height: abs(size.height))
    }

    /// A frame from the start of the video, upright.
    static func posterFrame(of asset: AVAsset) async throws -> UIImage {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: maxImageSide, height: maxImageSide)
        let (frame, _) = try await generator.image(at: CMTime(seconds: 0.1, preferredTimescale: 600))
        return UIImage(cgImage: frame)
    }
}

/// Lets PhotosPicker hand over a video as a file: `try await item.loadTransferable(type: PickedMovie.self)`.
struct PickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            // The picker's copy is deleted soon, so keep our own in the temporary folder.
            let copy = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return PickedMovie(url: copy)
        }
    }
}
