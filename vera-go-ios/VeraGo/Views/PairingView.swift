import SwiftUI
import AVFoundation

struct PairingView: View {
    let device: DesktopDevice
    let onPaired: (PairedDesktop) -> Void
    let onCancel: () -> Void

    @State private var showScanner = true
    @State private var pairingError: String?
    @State private var isPairing = false

    var body: some View {
        VStack(spacing: 20) {
            Text("Pair with \(device.hostname)")
                .font(.title2).bold()

            Text("Scan the QR code displayed on your VERA desktop")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            if showScanner {
                QRScannerView { payload in
                    handleQRPayload(payload)
                }
                .frame(height: 300)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                )
                .padding(.horizontal)
            }

            if isPairing {
                ProgressView("Pairing...")
            }

            if let error = pairingError {
                Text(error)
                    .foregroundColor(.red)
                    .font(.caption)
            }

            Button("Cancel") {
                onCancel()
            }
            .font(.caption)
        }
        .padding()
    }

    private func handleQRPayload(_ payload: String) {
        guard !isPairing else { return }
        isPairing = true
        pairingError = nil

        Task {
            guard let tokenData = payload.data(using: .utf8),
                  let token = try? JSONDecoder().decode(PairingToken.self, from: tokenData)
            else {
                pairingError = "Invalid QR code"
                isPairing = false
                return
            }

            do {
                let pairingService = VERAPairingService.shared
                let paired = try await pairingService.pairWithDesktop(device: device, token: token)
                showScanner = false
                onPaired(paired)
            } catch {
                pairingError = error.localizedDescription
                isPairing = false
            }
        }
    }
}

struct QRScannerView: UIViewControllerRepresentable {
    let onScan: (String) -> Void

    func makeUIViewController(context: Context) -> QRScannerController {
        let controller = QRScannerController()
        controller.onScan = onScan
        return controller
    }

    func updateUIViewController(_ uiViewController: QRScannerController, context: Context) {}
}

class QRScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScan: ((String) -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()
        startScanning()
    }

    private func startScanning() {
        guard let camera = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: camera)
        else { return }

        let session = AVCaptureSession()
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.frame = view.bounds
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)

        session.startRunning()
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let stringValue = object.stringValue
        else { return }
        onScan?(stringValue)
    }
}
