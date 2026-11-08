import PhotosUI
import SwiftUI

/// Step 1 of a new post: the photo library right in the screen (up to 10 photos or one video),
/// with a big preview of the last one picked. The Post / Story switch floats at the bottom.
struct MediaPickStep: View {
    @Bindable var draft: PostDraft
    var onStory: () -> Void

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                preview
                    .frame(width: geometry.size.width, height: min(geometry.size.width, geometry.size.height * 0.5))
                selectionBar
                // "Continuous" reports every tap right away (there's no Add button to press).
                PhotosPicker(selection: $draft.selection, maxSelectionCount: 10, selectionBehavior: .continuousAndOrdered,
                             matching: .any(of: [.images, .videos]), photoLibrary: .shared()) {
                    Text("Choose photos")
                }
                .photosPickerStyle(.inline)
                .photosPickerDisabledCapabilities([.selectionActions, .stagingArea])
                .photosPickerAccessoryVisibility(.hidden, edges: .all)
            }
        }
        .overlay(alignment: .bottom) {
            CreateModeSwitch(onStory: onStory)
                .padding(.bottom, 14)
        }
        .onChange(of: draft.selection) {
            Task { await draft.loadSelection() }
        }
    }

    /// The last photo picked, filling the square (the gray surface sets the size, so a tall
    /// photo can't stretch it).
    private var preview: some View {
        Theme.surface
            .overlay {
                if let last = draft.media.last {
                    Image(uiImage: last.image)
                        .resizable()
                        .scaledToFill()
                } else if !draft.isLoadingMedia {
                    VStack(spacing: 10) {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.system(size: 34, weight: .light))
                        Text("Pick up to 10 photos or a video")
                            .font(.subheadline)
                    }
                    .foregroundStyle(Theme.muted)
                }
            }
            .clipped()
            .overlay(alignment: .bottomTrailing) {
                if draft.media.last?.isVideo == true {
                    Image(systemName: "video.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(8)
                        .background(.black.opacity(0.5), in: Circle())
                        .padding(12)
                }
            }
            .overlay {
                if draft.isLoadingMedia {
                    ProgressView().controlSize(.large)
                }
            }
    }

    private var selectionBar: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Recents")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Spacer()
                if !draft.selection.isEmpty {
                    Text("\(draft.selection.count) selected")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .contentTransition(.numericText(value: Double(draft.selection.count)))
                        .animation(.snappy, value: draft.selection.count)
                }
            }
            if let problem = draft.selectionProblem ?? draft.errorMessage {
                Text(problem)
                    .font(.footnote)
                    .foregroundStyle(Theme.like)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

/// The "Post · Story" switch at the bottom of the Create tab. Story opens the story composer.
struct CreateModeSwitch: View {
    var onStory: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text("POST")
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.white.opacity(0.18), in: Capsule())
            Button(action: onStory) {
                Text("STORY")
                    .foregroundStyle(.white.opacity(0.75))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Make a story instead")
        }
        .font(.footnote.weight(.bold))
        .tracking(0.6)
        .padding(4)
        .background(.black.opacity(0.72), in: Capsule())
    }
}
