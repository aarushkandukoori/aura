import SwiftUI

/// "Here's your world": the plan to look over before building it. The summary, the people it picked
/// (plus friends who will join soon), the group chats, then what the person can change: photo, name,
/// username, bio, pronouns, interests and how popular they'll be. "Build my world" is in the footer.
struct ReviewStep: View {
    @Bindable var draft: OnboardingDraft
    /// The Google account's photo (the default profile picture), or nil.
    let accountPicture: String?

    @State private var choosingPhoto = false
    @State private var appeared = false

    var body: some View {
        if let plan = draft.plan {
            OnboardingPage(title: "Here's your world", subtitle: plan.summary) {
                // Sent back because the server refused the username: say so where it's seen first.
                if let problem = draft.usernameProblem {
                    Label("\(problem.hasSuffix(".") ? problem : problem + ".") Pick another username under You.",
                          systemImage: "exclamationmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.like)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(Theme.like.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .transition(.opacity)
                }
                section(0, title: "Your people", note: Format.count(plan.friends.count + plan.newFriends.count, "person", "people")) {
                    PlanPeopleRow(plan: plan)
                    if !plan.newFriends.isEmpty {
                        Text("We'll create \(names(plan.newFriends.map(\.name))) for you. They'll join in a few minutes.")
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                    }
                }
                if !plan.groupChats.isEmpty {
                    section(1, title: "Group chats", note: "\(plan.groupChats.count)") {
                        PlanChatList(plan: plan)
                    }
                }
                section(2, title: "You") {
                    photoRow
                    profileFields
                }
                section(3, title: "What you're into", note: interestNote, noteIsWarning: draft.interests.count < OnboardingDraft.minimumInterests) {
                    InterestPicker(selection: $draft.interests)
                }
                section(4, title: "How popular do you want to be?") {
                    VStack(spacing: 12) {
                        ForEach(Tier.allCases) { tier in
                            Button {
                                Haptics.selection()
                                draft.tier = tier
                            } label: {
                                TierCard(tier: tier, isSelected: draft.tier == tier)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .onAppear { appeared = true }
        }
    }

    // MARK: - Sections

    /// One part of the review, sliding up a moment after the one above it.
    private func section<Content: View>(_ index: Int, title: String, note: String? = nil, noteIsWarning: Bool = false,
                                        @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Spacer()
                if let note {
                    Text(note)
                        .font(.footnote.weight(noteIsWarning ? .semibold : .regular))
                        .foregroundStyle(noteIsWarning ? Theme.like : Theme.muted)
                        .contentTransition(.numericText())
                        .animation(.snappy, value: note)
                }
            }
            content()
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 14)
        .animation(Motion.slide.delay(0.06 + Double(index) * 0.08), value: appeared)
    }

    private var interestNote: String {
        let missing = OnboardingDraft.minimumInterests - draft.interests.count
        return missing > 0 ? "Pick \(missing) more" : "\(draft.interests.count) picked"
    }

    /// "Maya", "Maya and Theo", "Maya, Theo and Ana".
    private func names(_ list: [String]) -> String {
        guard list.count > 1 else { return list.first ?? "" }
        return list.dropLast().joined(separator: ", ") + " and " + (list.last ?? "")
    }

    // MARK: - You

    /// The profile photo (the Google one by default), with a button that opens the picker below it.
    private var photoRow: some View {
        VStack(spacing: 18) {
            HStack(spacing: 14) {
                AvatarView(path: draft.avatar, size: 64)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Profile photo")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.text)
                    Text(photoCaption)
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                Button(choosingPhoto ? "Done" : (draft.avatar == nil ? "Add" : "Change")) {
                    withAnimation(Motion.slide) { choosingPhoto.toggle() }
                }
                .buttonStyle(.aura(.secondary, size: .small))
                .disabled(draft.isUploadingAvatar)
            }
            if choosingPhoto {
                AvatarChooser(path: $draft.avatar, isUploading: $draft.isUploadingAvatar, previewSize: 96)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private var photoCaption: String {
        guard let avatar = draft.avatar else { return "Add one so your friends know it's you." }
        return avatar == accountPicture ? "From your Google account" : "Looking good."
    }

    private var profileFields: some View {
        VStack(alignment: .leading, spacing: 16) {
            LabeledField(label: "Name") {
                TextField("Your name", text: nameBinding)
                    .textContentType(.name)
            }
            LabeledField(label: "Username", note: usernameNote, noteIsWarning: usernameIsWarning) {
                HStack(spacing: 2) {
                    Text("@").foregroundStyle(Theme.muted)
                    TextField("username", text: usernameBinding)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.asciiCapable)
                }
            }
            LabeledField(label: "Bio") {
                TextField("A line about you ✨", text: bioBinding, axis: .vertical)
                    .lineLimit(2...4)
                    .padding(.vertical, 14)
            }
            LabeledField(label: "Pronouns") {
                TextField("Optional", text: $draft.pronouns)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        }
        .padding(.top, 6)
    }

    private var nameBinding: Binding<String> {
        Binding(get: { draft.displayName }, set: { draft.displayName = String($0.prefix(40)) })
    }

    private var usernameBinding: Binding<String> {
        Binding(
            get: { draft.username },
            set: { typed in
                draft.username = UsernameRules.clean(typed)
                draft.typedOwnUsername = true
            }
        )
    }

    private var bioBinding: Binding<String> {
        Binding(get: { draft.bio }, set: { draft.bio = String($0.prefix(OnboardingDraft.bioLimit)) })
    }

    private var usernameIsWarning: Bool {
        draft.usernameProblem != nil || UsernameRules.problem(with: draft.username) != nil
    }

    private var usernameNote: String {
        draft.usernameProblem ?? UsernameRules.problem(with: draft.username) ?? "Letters, numbers, dots and underscores."
    }
}
