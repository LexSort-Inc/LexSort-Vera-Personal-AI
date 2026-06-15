// website/js/download-detector.js
// LexSort Personal AI — OS Detection & Download Router
// Uses GitHub Releases directly as a reliable download backend

document.addEventListener("DOMContentLoaded", () => {

  // ── GitHub Release Base URL ──────────────────────────────────────────────
  // Update version string here when a new release ships
  const VERSION_LATEST = "v1.1.0";
  const VERSION_FALLBACK = "v1.0.2";

  const GITHUB_BASE_LATEST = `https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/download/${VERSION_LATEST}`;
  const GITHUB_BASE_FALLBACK = `https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/download/${VERSION_FALLBACK}`;
  const RELEASES_PAGE = "https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/latest";

  // ── Tauri-generated filenames (must match exactly what GitHub Actions produces)
  const ASSETS_LATEST = {
    mac_arm:   `LexSort.Personal.AI_${VERSION_LATEST.slice(1)}_aarch64.dmg`,
    mac_intel: `LexSort.Personal.AI_${VERSION_LATEST.slice(1)}_x64.dmg`,
    linux_deb: `LexSort.Personal.AI_${VERSION_LATEST.slice(1)}_amd64.deb`,
    linux_app: `LexSort.Personal.AI_${VERSION_LATEST.slice(1)}_amd64.AppImage`,
  };

  const ASSETS_FALLBACK = {
    windows:   `LexSort.Personal.AI_${VERSION_FALLBACK.slice(1)}_x64_en-US.msi`,
  };

  // ── Platform Detection ───────────────────────────────────────────────────
  const ua = window.navigator.userAgent;
  const platform = window.navigator.platform;

  // Mobile detection (including iPads spoofing Macintosh UA via Touch indicators)
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) || 
                   (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);

  // OS detection
  const isWindows = ua.includes("Windows");
  const isMac     = (ua.includes("Macintosh") || ua.includes("Mac OS X")) && !isMobile;
  const isLinux   = ua.includes("Linux") && !ua.includes("Android") && !isMobile;

  // Apple Silicon detection (WebGL renderer check - the most accurate browser method)
  let isAppleSilicon = false;
  if (isMac) {
    if (ua.includes("arm64") || ua.includes("apple silicon")) {
      isAppleSilicon = true;
    } else {
      try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (gl) {
          const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
          if (debugInfo) {
            const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();
            if (renderer.includes("apple") || renderer.includes("m1") || renderer.includes("m2") || renderer.includes("m3") || renderer.includes("m4")) {
              isAppleSilicon = true;
            }
          }
        }
      } catch (e) {
        // Fallback: Default to Apple Silicon since it's the dominant macOS hardware today
        isAppleSilicon = true;
      }
    }
  }

  // ── DOM Elements ─────────────────────────────────────────────────────────
  const downloadBtn     = document.getElementById("download-vera-btn");
  const osBadge         = document.getElementById("os-badge");
  const mobileWarning   = document.getElementById("mobile-warning");
  const desktopSection  = document.getElementById("download-section");
  const altLinks        = document.getElementById("alt-download-links");

  // ── Mobile: show warning CTA ─────────────────────────────────────────────
  if (isMobile) {
    if (desktopSection) desktopSection.style.display = "none";
    if (mobileWarning)  mobileWarning.style.display  = "block";
    return;
  }

  // ── Desktop: set primary download ────────────────────────────────────────
  let primaryUrl  = RELEASES_PAGE; // default fallback
  let osLabel     = "Your Platform";
  let altHtml     = "";

  if (isWindows) {
    primaryUrl = `${GITHUB_BASE_FALLBACK}/${ASSETS_FALLBACK.windows}`;
    osLabel    = "Windows 10 / 11 (x64)";
    altHtml    = `<a href="${RELEASES_PAGE}" target="_blank">Other versions →</a>`;

  } else if (isMac) {
    if (isAppleSilicon) {
      primaryUrl = `${GITHUB_BASE_LATEST}/${ASSETS_LATEST.mac_arm}`;
      osLabel    = "macOS (Apple Silicon)";
      altHtml    = `Not Apple Silicon? <a href="${GITHUB_BASE_LATEST}/${ASSETS_LATEST.mac_intel}">Download macOS Intel build</a>`;
    } else {
      primaryUrl = `${GITHUB_BASE_LATEST}/${ASSETS_LATEST.mac_intel}`;
      osLabel    = "macOS (Intel)";
      altHtml    = `On an M1/M2/M3 Mac? <a href="${GITHUB_BASE_LATEST}/${ASSETS_LATEST.mac_arm}">Download Apple Silicon build</a>`;
    }

  } else if (isLinux) {
    primaryUrl = `${GITHUB_BASE_LATEST}/${ASSETS_LATEST.linux_app}`;
    osLabel    = "Linux (AppImage)";
    altHtml    = `Also available as: <a href="${GITHUB_BASE_LATEST}/${ASSETS_LATEST.linux_deb}">Debian package (.deb)</a>`;
  }

  // ── Analytics tracking ───────────────────────────────────────────────────
  function sendAnalytics(filename, success = true, error = '') {
    const payload = {
      filename: filename,
      success: success,
      error: error,
      user_agent: ua,
      platform: platform,
      referrer: document.referrer,
      timestamp: new Date().toISOString()
    };

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/download-attempt', JSON.stringify(payload));
    } else {
      fetch('/api/download-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});
    }
  }

  // ── Update DOM ────────────────────────────────────────────────────────────
  if (downloadBtn) {
    downloadBtn.href        = primaryUrl;
    downloadBtn.innerHTML   = `⬇ Download for ${osLabel}`;
  }

  if (osBadge) {
    osBadge.textContent = `Detected: ${osLabel}`;
  }

  if (altLinks && altHtml) {
    altLinks.innerHTML = altHtml;
  }

  function showOnboardingModal() {
    const modal = document.getElementById('download-onboarding-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  // Hook up event listeners to all platform download buttons
  document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const urlParts = btn.href.split('/');
      const filename = urlParts[urlParts.length - 1];
      sendAnalytics(filename, true);
      showOnboardingModal();
    });
  });

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const urlParts = downloadBtn.href.split('/');
      const filename = urlParts[urlParts.length - 1];
      sendAnalytics(filename, true);
      showOnboardingModal();
    });
  }

  if (altLinks) {
    altLinks.addEventListener('click', (e) => {
      const target = e.target.closest('a');
      if (target && target.href) {
        const urlParts = target.href.split('/');
        const filename = urlParts[urlParts.length - 1];
        sendAnalytics(filename, true);
        showOnboardingModal();
      }
    });
  }

});

