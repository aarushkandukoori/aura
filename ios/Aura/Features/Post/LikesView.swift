import SwiftUI

/// Who liked a post: the people the server can name (closest friends first) with Follow buttons,
/// a search box, and "and N others" for the rest of the crowd.
struct LikesView: View {
    @Environment(AppStore.self) private var store
    let postId: String

    @State private var likers: [Account] = []
    @State private var total = 0
    @State private var hasLoaded = false
    @State private var errorMessage: String?
    @State private var query = ""

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                searchField
                if !hasLoaded {
                    ProgressView().padding(.top, 48)
                } else if likers.isEmpty {
                    if let errorMessage {
                        EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load likes", message: errorMessage,
                                       actionTitle: "Try again") { Task { await load() } }
                    } else {
                        EmptyStateView(systemImage: "heart", title: "No likes yet",
                                       message: "When people like this post, you'll see them here.")
                    }
                } else {
                    ForEach(filteredLikers) { account in
                        UserRow(account: account)
                    }
                    footer
                }
            }
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .navigationTitle("Likes")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { if !hasLoaded { await load() } }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Theme.muted)
            TextField("Search", text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        .font(.subheadline)
        .padding(.horizontal, 12)
        .frame(height: 38)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    /// "and 12,402 others": everyone who liked it but isn't listed by name.
    @ViewBuilder private var footer: some View {
        let likeCount = store.post(postId)?.likeCount ?? total
        let others = likeCount - likers.count
        if query.isEmpty && others > 0 {
            Text("and \(Format.count(others, "other")) liked this")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .contentTransition(.numericText(value: Double(others)))
                .animation(.snappy, value: others)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.top, 14)
        }
    }

    private var filteredLikers: [Account] {
        let search = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !search.isEmpty else { return likers }
        return likers.filter {
            $0.username.lowercased().contains(search) || $0.displayName.lowercased().contains(search)
        }
    }

    private func load() async {
        do {
            let response = try await API.postLikes(postId)
            likers = response.accounts
            total = response.total
            errorMessage = nil
        } catch {
            if error.isCancellation { return }
            errorMessage = error.localizedDescription
        }
        hasLoaded = true
    }
}
