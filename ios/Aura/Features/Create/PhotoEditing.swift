import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

/// The looks you can give a photo before posting, made with Core Image.
enum PhotoFilter: String, CaseIterable, Identifiable {
    case original, glow, dusk, mono, film, vivid, fade, cool, warm

    var id: String { rawValue }
    var name: String { rawValue.capitalized }

    /// The photo with this look applied (the same photo for Original).
    func apply(to image: UIImage) -> UIImage {
        guard self != .original, let cgImage = image.cgImage else { return image }
        let input = CIImage(cgImage: cgImage)
        // Some filters (bloom, vignette) spill past the edges, so cut back to the photo's own size.
        let output = filtered(input).cropped(to: input.extent)
        guard let rendered = PhotoEditing.context.createCGImage(output, from: input.extent) else { return image }
        return UIImage(cgImage: rendered)
    }

    private func filtered(_ input: CIImage) -> CIImage {
        switch self {
        case .original:
            return input
        case .glow: // soft dreamy light
            let bloom = CIFilter.bloom()
            bloom.inputImage = input
            bloom.radius = 12
            bloom.intensity = 0.55
            return adjust(bloom.outputImage ?? input, brightness: 0.02, contrast: 1, saturation: 1.1)
        case .dusk: // rosy evening light
            return adjust(tint(input, red: 1.08, green: 0.93, blue: 1.05), brightness: -0.02, contrast: 1.06, saturation: 0.9)
        case .mono:
            let mono = CIFilter.photoEffectMono()
            mono.inputImage = input
            return mono.outputImage ?? input
        case .film: // warm faded print with dark corners
            let transfer = CIFilter.photoEffectTransfer()
            transfer.inputImage = input
            let vignette = CIFilter.vignette()
            vignette.inputImage = transfer.outputImage ?? input
            vignette.intensity = 0.7
            vignette.radius = 1.6
            return vignette.outputImage ?? input
        case .vivid: // punchier colors
            let vibrance = CIFilter.vibrance()
            vibrance.inputImage = input
            vibrance.amount = 0.8
            return adjust(vibrance.outputImage ?? input, brightness: 0, contrast: 1.08, saturation: 1.12)
        case .fade: // washed out and soft
            return adjust(input, brightness: 0.06, contrast: 0.85, saturation: 0.75)
        case .cool: // a little blue
            return tint(input, red: 0.92, green: 1, blue: 1.1)
        case .warm: // a little golden
            return tint(input, red: 1.1, green: 1.02, blue: 0.88)
        }
    }

    /// Multiplies each color channel (above 1 = more of that color).
    private func tint(_ input: CIImage, red: CGFloat, green: CGFloat, blue: CGFloat) -> CIImage {
        let matrix = CIFilter.colorMatrix()
        matrix.inputImage = input
        matrix.rVector = CIVector(x: red, y: 0, z: 0, w: 0)
        matrix.gVector = CIVector(x: 0, y: green, z: 0, w: 0)
        matrix.bVector = CIVector(x: 0, y: 0, z: blue, w: 0)
        return matrix.outputImage ?? input
    }

    private func adjust(_ input: CIImage, brightness: Float, contrast: Float, saturation: Float) -> CIImage {
        let controls = CIFilter.colorControls()
        controls.inputImage = input
        controls.brightness = brightness
        controls.contrast = contrast
        controls.saturation = saturation
        return controls.outputImage ?? input
    }
}

/// The three crop shapes for a new post.
enum CropAspect: String, CaseIterable, Identifiable {
    case square = "1:1"
    case portrait = "4:5"
    case original = "Original"

    var id: String { rawValue }

    /// Width / height of the crop. Original keeps the photo's own shape, within the 4:5 to 1.91:1
    /// range the feed can show.
    func ratio(for image: UIImage?) -> CGFloat {
        switch self {
        case .square: return 1
        case .portrait: return 0.8
        case .original:
            guard let image, image.size.height > 0 else { return 0.8 }
            return min(max(image.size.width / image.size.height, 0.8), 1.91)
        }
    }
}

/// Cropping and filtering photos for a new post.
enum PhotoEditing {
    /// Making a Core Image context is slow, so the app shares one.
    static let context = CIContext()

    /// Cuts out the part of the photo inside the crop frame.
    /// `focus` says where the frame sits along the side that's too long: 0 = left/top edge,
    /// 0.5 = centered, 1 = right/bottom edge.
    static func crop(_ image: UIImage, ratio: CGFloat, focus: CGPoint) -> UIImage {
        guard let cgImage = image.cgImage else { return image }
        let width = CGFloat(cgImage.width)
        let height = CGFloat(cgImage.height)
        var rect = CGRect(x: 0, y: 0, width: width, height: height)
        if width / height > ratio {
            // Too wide: trim the sides.
            rect.size.width = (height * ratio).rounded()
            rect.origin.x = ((width - rect.width) * focus.x).rounded()
        } else {
            // Too tall: trim the top and bottom.
            rect.size.height = (width / ratio).rounded()
            rect.origin.y = ((height - rect.height) * focus.y).rounded()
        }
        guard let cut = cgImage.cropping(to: rect) else { return image }
        return UIImage(cgImage: cut)
    }

    /// The finished photo: cropped, then filtered. Slow-ish, so call it off the main thread.
    static func render(_ image: UIImage, ratio: CGFloat, focus: CGPoint, filter: PhotoFilter) -> UIImage {
        filter.apply(to: crop(image, ratio: ratio, focus: focus))
    }
}
