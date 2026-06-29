# VERA Go — iOS

Mobile companion for the VERA Freeware desktop application.

## Requirements

- Xcode 15.4+
- iOS 16.0+ deployment target
- Apple Developer account (individual for now; migrating to LexSort Inc. org)

## Setup

1. Open `VeraGo.xcodeproj` in Xcode.
2. Select the `VeraGo` target.
3. Under **Signing & Capabilities**, select your team (William Commu, C76T5D27A2).
4. The bundle ID is `com.lexsort.vera-go`.
5. Build and run on a physical device (mDNS discovery requires Wi-Fi).

## Architecture

```
VeraGo/
├── VeraGoApp.swift          # Entry point, onboarding flow, main tab view
├── Info.plist               # Usage descriptions, background modes
├── VeraGo.entitlements      # Keychain, network entitlements
├── Models/
│   ├── DesktopDevice.swift   # Discovered desktop representation
│   ├── VeraTask.swift        # Task model (matches REST API)
│   └── PairingToken.swift    # QR pairing token + PairedDesktop
├── Services/
│   ├── VERAAuthStore.swift   # Keychain-backed secure token storage
│   ├── VERADiscoveryService.swift  # mDNS discovery (NWBrowser)
│   ├── VERAPairingService.swift    # QR pairing + token exchange
│   ├── VERASyncService.swift       # REST client (CRUD tasks)
│   ├── VERANotificationService.swift  # Pre-scheduled local notifications
│   └── VERAChatService.swift     # WebSocket chat streaming
└── Views/
    ├── DiscoveryView.swift   # Device list / manual entry
    ├── PairingView.swift     # QR scanner
    ├── TaskListView.swift    # Task list with swipe actions
    ├── CalendarView.swift    # Month calendar with task dots
    ├── ChatView.swift        # Chat UI with voice input
    └── SettingsView.swift    # Desktop info, notification perms, unpair
```

## Phase 3 Feature Status

- [x] mDNS discovery (NWBrowser)
- [x] QR pairing + Keychain storage
- [x] Task list + calendar view
- [x] Create/edit/delete tasks (sync via REST)
- [x] Local notifications (pre-scheduled + foreground WebSocket)
- [x] Chat UI (WebSocket streaming)
- [ ] Voice input (speech-to-text)
- [ ] Offline mutation queue
- [ ] Background sync (BGTaskScheduler)
- [ ] Background notification WebSocket

## Desktop API

Requires the VERA Freeware desktop running on port 8888 with the REST API
and WebSocket endpoints enabled. See `docs/vera-go-mobile-spec-v1.2.md`.
