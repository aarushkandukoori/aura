import SwiftUI

/// The "aura" logo: lowercase rounded letters filled with the aura gradient.
struct AuraWordmark: View {
    var size: CGFloat = 30

    var body: some View {
        Text("aura")
            .font(.system(size: size, weight: .bold, design: .rounded))
            .tracking(-0.5)
            .foregroundStyle(Theme.auraGradient)
            .accessibilityLabel("Aura")
    }
}
