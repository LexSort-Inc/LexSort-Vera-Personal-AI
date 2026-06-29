import SwiftUI

struct SettingsView: View {
    let desktop: PairedDesktop
    let onUnpair: () -> Void

    @State private var showUnpairConfirmation = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Connected Desktop") {
                    LabeledContent("Hostname", value: desktop.hostname)
                    LabeledContent("IP Address", value: desktop.ip)
                    LabeledContent("Port", value: "\(desktop.port)")
                    LabeledContent("Token Expires", value: desktop.token.expires.formatted(date: .abbreviated, time: .shortened))
                }

                Section("Notifications") {
                    Button("Request Notification Permission") {
                        Task { @MainActor in
                            let center = UNUserNotificationCenter.current()
                            _ = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
                        }
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: "1.0.0")
                    LabeledContent("Build", value: "Phase 3")
                    HStack {
                        Text("Privacy")
                        Spacer()
                        Text("No cloud, no tracking")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                }

                Section {
                    Button(role: .destructive) {
                        showUnpairConfirmation = true
                    } label: {
                        Label("Unpair Desktop", systemImage: "link.badge.minus")
                    }
                }
            }
            .navigationTitle("Settings")
            .alert("Unpair Desktop?", isPresented: $showUnpairConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Unpair", role: .destructive) {
                    onUnpair()
                }
            } message: {
                Text("This will clear the pairing token. You'll need to scan the QR code again to reconnect.")
            }
        }
    }
}
