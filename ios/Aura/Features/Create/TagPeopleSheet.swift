import SwiftUI

/// Pick who's in the photo: people you follow at first, anyone once you search.
struct TagPeopleSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Binding var tagged: [Account]

    @State private var query = ""
    @State private var following: [Account] = []
    @State private var results: [Account] = []

    /// The server accepts up to 20 tags per post.
    private let maxTags = 20

    var body: some View {
        NavigationStack {
            List {
                if !tagged.isEmpty && query.isEmpty {
                    Section("Tagged") {
                        ForEach(tagged) { row(for: $0) }
                    }
                }
                Section(query.isEmpty ? "People you follow" : "Results") {
                    ForEach(shownPeople) { row(for: $0) }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search people")
            .textInputAutocapitalization(.never)
            .navigationTitle("Tag people")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
            .task { await loadFollowing() }
            .task(id: query) { await search() }
        }
    }

    private var shownPeople: [Account] {
        let people = query.isEmpty ? following : results
        // Already-tagged people are listed in their own section while not searching.
        return query.isEmpty ? people.filter { person in !tagged.contains { $0.id == person.id } } : people
    }

    private func row(for account: Account) -> some View {
        let isTagged = tagged.contains { $0.id == account.id }
        return Button { toggle(account) } label: {
            HStack(spacing: 12) {
                AvatarView(account: account, size: 40)
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Text(account.username)
                            .font(.subheadline.weight(.semibold))
                        if account.verified { VerifiedBadge(size: 11) }
                    }
                    Text(account.displayName)
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: isTagged ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isTagged ? Theme.accent : Theme.border)
            }
            .foregroundStyle(Theme.text)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(Theme.background)
    }

    private func toggle(_ account: Account) {
        if let index = tagged.firstIndex(where: { $0.id == account.id }) {
            tagged.remove(at: index)
        } else if tagged.count < maxTags {
            tagged.append(account)
        }
        Haptics.selection()
    }

    private func loadFollowing() async {
        guard let username = store.me?.username,
              let response = try? await API.following(username) else { return }
        following = response.accounts
    }

    /// Waits for a short pause in typing, then searches.
    private func search() async {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else {
            results = []
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled, let found = try? await API.search(text) else { return }
        results = found.accounts.filter { !$0.isMe }
    }
}
