import SwiftUI

/// Search for people and hashtags. Results update as you type (after a short pause); with an empty
/// search box it shows what you opened recently and people you might like.
struct SearchView: View {
    @Environment(AppStore.self) private var store

    @State private var query = ""
    @State private var result: SearchResult?
    @State private var errorMessage: String?
    @State private var recents = RecentSearches.load()
    @State private var suggestions: [Account] = []

    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if trimmedQuery.isEmpty {
                    recentSection
                    suggestionsSection
                } else {
                    resultsSection
                }
            }
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search people and #tags")
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .modifier(FocusSearchOnAppear())
        .task(id: trimmedQuery) { await search() }
        .task { if suggestions.isEmpty { suggestions = (try? await API.suggestions()) ?? [] } }
    }

    // MARK: - Empty search box

    @ViewBuilder private var recentSection: some View {
        if !recents.isEmpty {
            HStack {
                SectionTitle(text: "Recent")
                Spacer()
                Button("Clear all") {
                    RecentSearches.clear()
                    withAnimation { recents = [] }
                }
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 16)
            }
            ForEach(recents) { item in
                HStack(spacing: 0) {
                    if let account = item.account {
                        AccountResultRow(account: account) { open(account) }
                    } else if let tag = item.tag {
                        TagResultRow(tag: tag, postCount: nil) { open(tag: tag) }
                    }
                    Button {
                        withAnimation { recents = RecentSearches.remove(item) }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 6)
                    .accessibilityLabel("Remove from recent")
                }
            }
        }
    }

    @ViewBuilder private var suggestionsSection: some View {
        if !suggestions.isEmpty {
            SectionTitle(text: "Suggested for you")
                .padding(.top, recents.isEmpty ? 0 : 12)
            ForEach(suggestions) { account in
                UserRow(account: account, subtitle: suggestionReason(for: account))
            }
        } else if recents.isEmpty {
            EmptyStateView(systemImage: "magnifyingglass", title: "Find your people",
                           message: "Search for friends, creators and #hashtags.")
                .padding(.top, 40)
        }
    }

    // MARK: - Results

    @ViewBuilder private var resultsSection: some View {
        if let result {
            let tagsFirst = trimmedQuery.hasPrefix("#")
            if result.accounts.isEmpty && result.tags.isEmpty {
                EmptyStateView(systemImage: "magnifyingglass", title: "No results",
                               message: "Nothing matches “\(trimmedQuery)” yet.")
                    .padding(.top, 40)
            } else {
                if tagsFirst { tagRows(result.tags) }
                ForEach(result.accounts) { account in
                    AccountResultRow(account: account) { open(account) }
                }
                if !tagsFirst { tagRows(result.tags) }
            }
        } else if let errorMessage {
            EmptyStateView(systemImage: "wifi.slash", title: "Couldn't search", message: errorMessage)
                .padding(.top, 40)
        } else {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
        }
    }

    private func tagRows(_ tags: [TagResult]) -> some View {
        ForEach(tags) { tag in
            TagResultRow(tag: tag.tag, postCount: tag.postCount) { open(tag: tag.tag) }
        }
    }

    // MARK: - Actions

    /// Waits for typing to pause, then asks the server. Typing again cancels this task (.task(id:)).
    private func search() async {
        let text = trimmedQuery
        guard !text.isEmpty else {
            result = nil
            errorMessage = nil
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        do {
            let found = try await API.search(text)
            withAnimation(.snappy(duration: 0.2)) { result = found }
            errorMessage = nil
        } catch {
            if !error.isCancellation {
                result = nil
                errorMessage = error.localizedDescription
            }
        }
    }

    private func open(_ account: Account) {
        recents = RecentSearches.add(RecentSearch(account: account))
        store.navigate(to: .profile(account.username))
    }

    private func open(tag: String) {
        recents = RecentSearches.add(RecentSearch(tag: tag))
        store.navigate(to: .tag(tag))
    }

    private func suggestionReason(for account: Account) -> String {
        if store.latest(account).followsMe { return "Follows you" }
        return account.role == .creator ? "Popular on Aura" : account.displayName
    }
}

// MARK: - Rows

/// A bold section heading inside a list ("Recent", "Suggested for you").
struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.headline)
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 6)
    }
}

/// A person in search results: avatar, username, name and how you're connected.
private struct AccountResultRow: View {
    @Environment(AppStore.self) private var store
    let account: Account
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                AvatarView(account: account, size: 48, showsStoryRing: true)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(account.username)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                        if account.verified { VerifiedBadge(size: 12) }
                    }
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var subtitle: String {
        let current = store.latest(account)
        let relation = current.iFollow ? "Following" : (current.followsMe ? "Follows you" : nil)
        return [account.displayName, relation].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " • ")
    }
}

/// A hashtag in search results: a round "#", the tag and how many posts use it.
private struct TagResultRow: View {
    let tag: String
    let postCount: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "number")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .frame(width: 48, height: 48)
                    .overlay(Circle().strokeBorder(Theme.border, lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text("#\(tag)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                    if let postCount {
                        Text(Format.count(postCount, "post"))
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Puts the cursor in the search box the first time the screen opens (iOS 18 and later can do this).
/// Coming back from a profile opened from the results leaves the keyboard down.
private struct FocusSearchOnAppear: ViewModifier {
    @FocusState private var focused: Bool
    @State private var didFocus = false

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content
                .searchFocused($focused)
                .task {
                    guard !didFocus else { return }
                    didFocus = true
                    try? await Task.sleep(for: .milliseconds(350)) // after the push animation
                    focused = true
                }
        } else {
            content
        }
    }
}
