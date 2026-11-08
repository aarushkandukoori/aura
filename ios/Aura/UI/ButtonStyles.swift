import SwiftUI

/// Aura's two button looks: primary (accent fill, white text) and secondary (gray fill).
///
///     Button("Follow") { ... }.buttonStyle(.auraPrimary)
///     Button("Message") { ... }.buttonStyle(.auraSecondary)
///     Button("Edit profile") { ... }.buttonStyle(.aura(.secondary, fullWidth: true))
///     Button("Follow") { ... }.buttonStyle(.aura(.primary, size: .small))   // in list rows
struct AuraButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary }
    enum Size { case small, regular, large }

    var kind: Kind = .primary
    var size: Size = .regular
    var fullWidth = false

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(size == .large ? .body.weight(.semibold) : .subheadline.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, size == .small ? 14 : 18)
            .frame(height: height)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .foregroundStyle(kind == .primary ? Color.white : Theme.text)
            .background(background(pressed: configuration.isPressed), in: RoundedRectangle(cornerRadius: size == .large ? 14 : 10, style: .continuous))
            .contentShape(Rectangle())
            .opacity(isEnabled ? 1 : 0.45)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var height: CGFloat {
        switch size {
        case .small: 32
        case .regular: 36
        case .large: 50
        }
    }

    private func background(pressed: Bool) -> Color {
        switch kind {
        case .primary: pressed ? Theme.accentPressed : Theme.accent
        case .secondary: pressed ? Theme.border : Theme.secondaryFill
        }
    }
}

extension ButtonStyle where Self == AuraButtonStyle {
    static var auraPrimary: AuraButtonStyle { AuraButtonStyle(kind: .primary) }
    static var auraSecondary: AuraButtonStyle { AuraButtonStyle(kind: .secondary) }

    static func aura(_ kind: AuraButtonStyle.Kind, size: AuraButtonStyle.Size = .regular, fullWidth: Bool = false) -> AuraButtonStyle {
        AuraButtonStyle(kind: kind, size: size, fullWidth: fullWidth)
    }
}
