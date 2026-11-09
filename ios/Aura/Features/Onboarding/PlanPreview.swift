import SwiftUI

/// The plan's people on the review screen: a sideways row of friend cards (picture, name, bestie or
/// friend, how you know each other), then the friends still to be created, with dashed edges.
struct PlanPeopleRow: View {
    let plan: WorldPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 10) {
                ForEach(Array(plan.friends.enumerated()), id: \.offset) { index, friend in
                    card(index: index, dashed: false) {
                        if let account = friend.account {
                            AvatarView(path: account.avatar, size: 64, ring: friend.role == .bestie ? .unseen : .none)
                        } else {
                            Initial(name: friend.id)
                        }
                        Text(firstName(friend.account?.displayName ?? friend.id))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                            .padding(.top, 8)
                        RolePill(role: friend.role)
                        Text(PlanText.forYou(friend.relationship))
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                            .lineLimit(4)
                            .padding(.top, 8)
                    }
                }
                ForEach(Array(plan.newFriends.enumerated()), id: \.offset) { index, person in
                    card(index: plan.friends.count + index, dashed: true) {
                        Initial(name: person.name)
                        Text(person.name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                            .padding(.top, 8)
                        JoiningSoonPill()
                        Text(PlanText.forYou(person.description))
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                            .lineLimit(4)
                            .padding(.top, 8)
                    }
                }
            }
            .scrollTargetLayout()
        }
        .scrollIndicators(.hidden)
        .scrollTargetBehavior(.viewAligned)
        // The row runs to the screen edges, so cards slide in from the side like a stories row.
        .contentMargins(.horizontal, 24, for: .scrollContent)
        .padding(.horizontal, -24)
        .onAppear { appeared = true }
    }

    /// One card, springing in a moment after the one before it.
    private func card<Content: View>(index: Int, dashed: Bool, @ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
            Spacer(minLength: 0)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 12)
        .padding(.top, 16)
        .padding(.bottom, 14)
        .frame(width: 148, height: 222)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Theme.border, style: StrokeStyle(lineWidth: 1, dash: dashed ? [5, 4] : []))
        }
        .scaleEffect(appeared || reduceMotion ? 1 : 0.94)
        .offset(y: appeared || reduceMotion ? 0 : 10)
        .opacity(appeared ? 1 : 0)
        .animation(Motion.pop.orFade(reduceMotion).delay(0.12 + Double(min(index, 8)) * 0.05), value: appeared)
    }

    private func firstName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }
}

/// The plan's group chats: emoji, name, what it's like, and a few of the members' faces.
struct PlanChatList: View {
    let plan: WorldPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    var body: some View {
        let accounts = Dictionary(plan.friends.compactMap { friend in friend.account.map { (friend.id, $0) } },
                                  uniquingKeysWith: { first, _ in first })
        VStack(spacing: 8) {
            ForEach(Array(plan.groupChats.enumerated()), id: \.offset) { index, group in
                HStack(spacing: 12) {
                    Text(group.emoji)
                        .font(.system(size: 22))
                        .frame(width: 44, height: 44)
                        .background(Theme.surface, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(group.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.text)
                            .lineLimit(1)
                        Text(group.vibe)
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 4)
                    StackedAvatars(paths: group.memberIds.compactMap { accounts[$0]?.avatar }, size: 22)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.border, lineWidth: 1))
                .offset(x: appeared || reduceMotion ? 0 : 16)
                .opacity(appeared ? 1 : 0)
                .animation(Motion.slide.orFade(reduceMotion).delay(0.2 + Double(index) * 0.07), value: appeared)
            }
        }
        .onAppear { appeared = true }
    }
}

enum PlanText {
    /// Relationships are written about "the user"; on screen they speak to the person.
    static func forYou(_ text: String) -> String {
        text.replacingOccurrences(of: "\\bthe user's\\b", with: "your", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "\\bthe user\\b", with: "you", options: [.regularExpression, .caseInsensitive])
    }
}

private struct RolePill: View {
    let role: Role

    var body: some View {
        Text(role == .bestie ? "Bestie" : "Friend")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(role == .bestie ? Color.white : Theme.accent)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(role == .bestie ? AnyShapeStyle(Theme.auraGradient) : AnyShapeStyle(Theme.accent.opacity(0.12)),
                        in: Capsule())
            .padding(.top, 4)
    }
}

/// "Joining soon", with a softly pulsing green dot.
private struct JoiningSoonPill: View {
    @State private var dim = false

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(Theme.aura4)
                .frame(width: 6, height: 6)
                .opacity(dim ? 0.35 : 1)
            Text("Joining soon")
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(Theme.muted)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Theme.secondaryFill, in: Capsule())
        .padding(.top, 4)
        .onAppear {
            withAnimation(.easeInOut(duration: 1).repeatForever()) { dim = true }
        }
    }
}

/// A soft aura circle with a first letter, for friends whose picture doesn't exist yet.
private struct Initial: View {
    let name: String

    var body: some View {
        Text(name.trimmingCharacters(in: .whitespaces).prefix(1).uppercased())
            .font(.system(size: 26, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: 64, height: 64)
            .background(Theme.auraGradient, in: Circle())
    }
}
