import SwiftUI

/// Edit my profile: picture, name, username, pronouns, bio and interests. Only what changed is sent.
struct EditProfileView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var username = ""
    @State private var pronouns = ""
    @State private var bio = ""
    @State private var interests: [String] = []
    @State private var avatar: String?
    @State private var isUploading = false
    @State private var filledIn = false
    @State private var saving = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                AvatarChooser(path: $avatar, isUploading: $isUploading, previewSize: 104)
                    .frame(maxWidth: .infinity)

                VStack(alignment: .leading, spacing: 16) {
                    LabeledField(label: "Name") {
                        TextField("Your name", text: $displayName)
                            .textContentType(.name)
                    }
                    LabeledField(label: "Username", note: usernameNote, noteIsWarning: usernameProblem != nil) {
                        HStack(spacing: 2) {
                            Text("@").foregroundStyle(Theme.muted)
                            TextField("username", text: usernameBinding)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.asciiCapable)
                        }
                    }
                    LabeledField(label: "Pronouns") {
                        TextField("Optional", text: $pronouns)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    LabeledField(label: "Bio", note: "\(bio.count)/\(OnboardingDraft.bioLimit)") {
                        TextField("A line about you", text: bioBinding, axis: .vertical)
                            .lineLimit(2...5)
                            .padding(.vertical, 14)
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Interests")
                        .font(.headline)
                        .foregroundStyle(Theme.text)
                    Text(interests.isEmpty ? "Pick at least one." : "Your friends and Explore use these.")
                        .font(.footnote)
                        .foregroundStyle(interests.isEmpty ? Theme.like : Theme.muted)
                    InterestPicker(selection: $interests)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.like)
                }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Edit profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if saving {
                    ProgressView()
                } else {
                    Button("Save") { Task { await save() } }
                        .fontWeight(.semibold)
                        .disabled(!canSave)
                }
            }
        }
        .onAppear(perform: fillIn)
    }

    // MARK: - Form state

    /// Copies my current profile into the form, once.
    private func fillIn() {
        guard !filledIn, let me = store.me else { return }
        filledIn = true
        displayName = me.displayName
        username = me.username
        pronouns = me.pronouns
        bio = me.bio
        interests = me.interests
        avatar = me.avatar
    }

    private var trimmedName: String { displayName.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedBio: String { bio.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedPronouns: String { pronouns.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var usernameProblem: String? { UsernameRules.problem(with: username) }

    private var usernameNote: String? {
        if let usernameProblem { return usernameProblem }
        return username == store.me?.username ? nil : "Your profile link changes too."
    }

    private var usernameBinding: Binding<String> {
        Binding(get: { username }, set: { username = UsernameRules.clean($0) })
    }

    private var bioBinding: Binding<String> {
        Binding(get: { bio }, set: { bio = String($0.prefix(OnboardingDraft.bioLimit)) })
    }

    /// What changed compared to my current profile (nil fields are left alone by the server).
    private var changes: UpdateMeRequest {
        guard let me = store.me else { return UpdateMeRequest() }
        var request = UpdateMeRequest()
        if trimmedName != me.displayName { request.displayName = trimmedName }
        if username != me.username { request.username = username }
        if avatar != me.avatar, let avatar { request.avatar = avatar }
        if trimmedBio != me.bio { request.bio = trimmedBio }
        if trimmedPronouns != me.pronouns { request.pronouns = trimmedPronouns }
        if interests != me.interests { request.interests = interests }
        return request
    }

    private var hasChanges: Bool {
        let request = changes
        return request.displayName != nil || request.username != nil || request.avatar != nil
            || request.bio != nil || request.pronouns != nil || request.interests != nil
    }

    private var canSave: Bool {
        hasChanges && !trimmedName.isEmpty && usernameProblem == nil && !interests.isEmpty && !isUploading
    }

    // MARK: - Saving

    private func save() async {
        saving = true
        errorMessage = nil
        defer { saving = false }
        do {
            try await store.updateMe(changes)
            Haptics.success()
            store.showToast("Profile updated")
            dismiss()
        } catch {
            if error.isCancellation { return }
            Haptics.error()
            errorMessage = error.localizedDescription
        }
    }
}
