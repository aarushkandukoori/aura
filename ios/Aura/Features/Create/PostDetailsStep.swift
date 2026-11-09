import SwiftUI

/// Step 3 of a new post: caption, location and tagged people, then Share.
struct PostDetailsStep: View {
    @Environment(AppStore.self) private var store
    @Bindable var draft: PostDraft
    /// Share was tapped: CreateView hands the draft to PostingQueue and goes back to Home.
    var onShare: () -> Void

    @State private var cover: UIImage?
    @State private var showsTagPeople = false
    @FocusState private var captionFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 12) {
                    coverImage
                    TextField("Write a caption…", text: $draft.caption, axis: .vertical)
                        .font(.subheadline)
                        .lineLimit(4...10)
                        .focused($captionFocused)
                }
                .padding(16)

                divider
                locationRow
                divider
                tagRow
                if !draft.tagged.isEmpty {
                    taggedChips
                }
                divider

                if let errorMessage = draft.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Theme.like)
                        .padding(16)
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { shareButton }
        .sheet(isPresented: $showsTagPeople) {
            TagPeopleSheet(tagged: $draft.tagged)
                .environment(store)
        }
        .task { await makeCover() }
    }

    // MARK: - Rows

    private var coverImage: some View {
        Group {
            if let cover {
                Image(uiImage: cover).resizable().scaledToFill()
            } else {
                Theme.surface
            }
        }
        .frame(width: 64, height: 80)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .overlay(alignment: .topTrailing) {
            if draft.media.count > 1 {
                Image(systemName: "square.fill.on.square.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(radius: 2)
                    .padding(5)
            } else if draft.isVideo {
                Image(systemName: "play.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(radius: 2)
                    .padding(5)
            }
        }
    }

    private var locationRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "mappin.and.ellipse")
                .frame(width: 24)
            TextField("Add location", text: $draft.location)
                .textInputAutocapitalization(.words)
            if !draft.location.isEmpty {
                Button { draft.location = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove location")
            }
        }
        .font(.subheadline)
        .foregroundStyle(Theme.text)
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
    }

    private var tagRow: some View {
        Button { showsTagPeople = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.rectangle")
                    .frame(width: 24)
                Text("Tag people")
                Spacer()
                if !draft.tagged.isEmpty {
                    Text(draft.tagged.count == 1 ? draft.tagged[0].username : "\(draft.tagged.count) people")
                        .foregroundStyle(Theme.muted)
                }
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.muted)
            }
            .font(.subheadline)
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var taggedChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(draft.tagged) { account in
                    HStack(spacing: 6) {
                        AvatarView(account: account, size: 22)
                        Text(account.username)
                            .font(.footnote.weight(.semibold))
                        Button { draft.tagged.removeAll { $0.id == account.id } } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(Theme.muted)
                                .frame(width: 22, height: 22)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Untag \(account.username)")
                    }
                    .padding(.leading, 4)
                    .padding(.trailing, 10)
                    .padding(.vertical, 4)
                    .background(Theme.surface, in: Capsule())
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }

    private var divider: some View {
        Rectangle().fill(Theme.border).frame(height: 0.5)
    }

    // MARK: - Sharing

    /// Share (one post at a time: while the last one is still uploading, it waits).
    private var shareButton: some View {
        let isBusy = PostingQueue.shared.isActive
        return VStack(spacing: 6) {
            if isBusy {
                Text("Your last post is still sharing…")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            Button {
                captionFocused = false
                onShare()
            } label: {
                Text("Share")
            }
            .buttonStyle(.aura(.primary, size: .large, fullWidth: true))
            .disabled(isBusy)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.background)
    }

    /// The first photo as it will look (cropped and filtered), for the small preview.
    private func makeCover() async {
        guard let first = draft.media.first else { return }
        if first.isVideo {
            cover = first.image
            return
        }
        let ratio = draft.cropRatio
        cover = await Task.detached(priority: .userInitiated) {
            PhotoEditing.render(Uploader.resize(first.image, maxSide: 400), ratio: ratio, focus: first.focus, filter: first.filter)
        }.value
    }
}
