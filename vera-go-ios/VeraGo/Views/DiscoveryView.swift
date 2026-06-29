import SwiftUI

struct DiscoveryView: View {
    @State private var devices: [DesktopDevice] = []
    @State private var isScanning = true
    @State private var errorMessage: String?
    @State private var manualIP = ""
    @State private var showManualEntry = false
    @State private var discoveryService = VERADiscoveryService()

    let onDeviceSelected: (DesktopDevice) -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(.system(size: 48))
                .foregroundColor(.accentColor)

            Text("VERA Go")
                .font(.largeTitle).bold()

            Text("Discover your VERA desktop on the local network")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            if isScanning {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Scanning for VERA desktops...")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }

            if let error = errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            if devices.isEmpty && !isScanning && errorMessage == nil {
                ContentUnavailableView(
                    "No Desktops Found",
                    systemImage: "antenna.radiowaves.left.and.right.slash",
                    description: Text("Make sure VERA is running on your desktop and you're on the same Wi-Fi network")
                )
            }

            List {
                ForEach(devices) { device in
                    Button {
                        discoveryService.stopScanning()
                        onDeviceSelected(device)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(device.hostname).fontWeight(.semibold)
                                Text("\(device.ip):\(device.port)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)

            Button("Scan Again") {
                startScanning()
            }
            .buttonStyle(.borderedProminent)
            .disabled(isScanning)

            Button("Enter IP Manually") {
                showManualEntry = true
            }
            .font(.caption)
        }
        .padding()
        .sheet(isPresented: $showManualEntry) {
            manualEntrySheet
        }
        .onAppear {
            startScanning()
        }
        .onDisappear {
            discoveryService.stopScanning()
        }
    }

    private var manualEntrySheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Desktop IP Address", text: $manualIP)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .keyboardType(.numbersAndPunctuation)
                } footer: {
                    Text("Enter the IP address of the computer running VERA. Port 8888 is used by default.")
                }
            }
            .navigationTitle("Manual Entry")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Connect") {
                        let ip = manualIP.trimmingCharacters(in: .whitespaces)
                        let device = DesktopDevice(
                            id: UUID(),
                            hostname: ip,
                            ip: ip,
                            port: 8888,
                            isPaired: false
                        )
                        discoveryService.stopScanning()
                        onDeviceSelected(device)
                        showManualEntry = false
                    }
                    .disabled(manualIP.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showManualEntry = false }
                }
            }
        }
    }

    private func startScanning() {
        isScanning = true
        errorMessage = nil
        devices = []
        discoveryService.stopScanning()

        discoveryService = VERADiscoveryService()
        discoveryService.onUpdate = { [self] discovered in
            Task { @MainActor in
                self.devices = discovered
                self.isScanning = false
            }
        }
        discoveryService.onError = { [self] error in
            Task { @MainActor in
                self.errorMessage = error.localizedDescription
                self.isScanning = false
            }
        }
        discoveryService.startScanning()
    }
}
